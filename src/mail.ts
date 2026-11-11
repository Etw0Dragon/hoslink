import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Config } from "./config.js";
export function mailer(c: Config) {
  const transport = c.SMTP_URL ? nodemailer.createTransport(c.SMTP_URL) : null;
  return async (to: string, subject: string, url: string) => {
    if (transport) {
      await transport.sendMail({
        from: c.MAIL_FROM,
        to,
        subject,
        text: `${url}\nCe lien est personnel.`,
      });
      return;
    }
    await mkdir(c.MAIL_DIR, { recursive: true, mode: 0o700 });
    await writeFile(
      `${c.MAIL_DIR}/${randomUUID()}.eml`,
      `From: ${c.MAIL_FROM}\nTo: ${to}\nSubject: ${subject}\n\n${url}\n`,
      { mode: 0o600, flag: "wx" },
    );
  };
}
