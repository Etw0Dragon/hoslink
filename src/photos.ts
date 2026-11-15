const maxBytes = 4 * 1024 * 1024;
const maxPixels = 20_000_000;
const maxDimension = 6000;

type ImageInfo = { contentType: "image/jpeg" | "image/png"; width: number; height: number };

function jpegInfo(data: Buffer): ImageInfo | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < data.length) {
    if (data[offset] !== 0xff) return null;
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return null;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return {
        contentType: "image/jpeg",
        height: data.readUInt16BE(offset + 3),
        width: data.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function imageInfo(data: Buffer): ImageInfo | null {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    data.length >= 33 &&
    data.subarray(0, 8).equals(pngSignature) &&
    data.readUInt32BE(8) === 13 &&
    data.toString("ascii", 12, 16) === "IHDR"
  ) {
    return {
      contentType: "image/png",
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
    };
  }
  return jpegInfo(data);
}

export async function readProfilePhoto(file: File) {
  if (!file.size || file.size > maxBytes) return null;
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length !== file.size) return null;
  const info = imageInfo(data);
  if (
    !info ||
    info.width < 1 ||
    info.height < 1 ||
    info.width > maxDimension ||
    info.height > maxDimension ||
    info.width * info.height > maxPixels
  )
    return null;
  return { data, contentType: info.contentType };
}
