import net from "node:net";

const chunkSize = 64 * 1024;
const timeoutMs = 30_000;

/** Sends PDF bytes using clamd's INSTREAM protocol; true means clean. */
export function scanWithClamAV(
  data: Buffer,
  host: string,
  port: number,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error?: Error, clean?: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(!!clean);
    };
    socket.setTimeout(timeoutMs, () =>
      finish(new Error("ClamAV scan timed out")),
    );
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < data.length; offset += chunkSize) {
        const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      if (response.length > 4096) {
        finish(new Error("ClamAV returned an oversized response"));
        return;
      }
      const end = response.indexOf(0);
      if (end < 0) return;
      const verdict = response.subarray(0, end).toString("utf8");
      if (verdict.endsWith(": OK") || verdict === "stream: OK") finish(undefined, true);
      else if (verdict.endsWith(" FOUND")) finish(undefined, false);
      else finish(new Error("ClamAV did not return a clean scan verdict"));
    });
    socket.once("error", (error) => finish(error));
    socket.once("close", () => {
      if (!settled) finish(new Error("ClamAV closed the scan connection"));
    });
  });
}
