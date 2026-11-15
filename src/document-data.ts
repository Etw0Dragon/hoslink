import { z } from "zod";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { createHash } from "node:crypto";
const text = z.string().trim().max(10000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
const optionalDate = date.or(z.literal(""));
export const documentInput = z
  .object({
    reference: z.string().trim().max(100),
    date,
    validUntil: optionalDate.default(""),
    issuer: text,
    recipient: text,
    layout: z.enum(["classic", "modern", "partnership"]).default("classic"),
    lines: z
      .array(
        z.object({
          label: z.string().max(300),
          quantity: z.number().min(0).max(100000),
          unitCents: z.number().int().min(0).max(100000000),
          vat: z.number().min(0).max(100),
        }),
      )
      .max(100)
      .default([]),
    benefits: text.default(""),
    commitments: text.default(""),
    start: optionalDate.default(""),
    end: optionalDate.default(""),
    renewal: text.default(""),
    conditions: text.default(""),
    fields: z
      .array(
        z.object({
          page: z.number().int().min(1).max(100),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          text: z.string().max(1000),
          size: z.number().min(6).max(48).default(12),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine(
    (v) => !v.start || !v.end || v.end >= v.start,
    "La fin doit suivre le début.",
  );
export type DocumentData = z.infer<typeof documentInput>;
export const signatureDrawing = z
  .array(
    z
      .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
      .min(2)
      .max(1000),
  )
  .min(1)
  .max(50);
export function totals(data: DocumentData) {
  let net = 0,
    tax = 0;
  for (const l of data.lines) {
    const amount = Math.round(l.quantity * l.unitCents);
    net += amount;
    tax += Math.round((amount * l.vat) / 100);
  }
  return { net, tax, gross: net + tax };
}
export const digest = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const printable = (s: string) =>
  s.replace(
    /[^\x20-\x7e\xa0-\xff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122\n]/g,
    " ",
  );
export async function makePDF(
  data: DocumentData,
  kind: string,
  original?: Buffer | null,
) {
  const pdf = original
    ? await PDFDocument.load(original)
    : await PDFDocument.create();
  if (pdf.isEncrypted) throw new Error("PDF chiffré");
  if (pdf.getPageCount() > 100) throw new Error("100 pages maximum");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  if (!original) {
    let page = pdf.addPage([595, 842]),
      y = 790;
    if (data.layout === "modern") {
      page.drawRectangle({
        x: 0,
        y: 820,
        width: 595,
        height: 22,
        color: rgb(0.78, 0.63, 0.36),
      });
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 18,
        height: 842,
        color: rgb(0.047, 0.15, 0.21),
      });
    }
    const line = (s: string, size = 11) => {
      // Wrap by measured glyph width, preserving explicit paragraphs.
      for (const paragraph of printable(s).split("\n")) {
        let row = "";
        for (const word of paragraph.split(" ")) {
          if (font.widthOfTextAtSize(row + word, size) > 490 && row) {
            draw(row);
            row = "";
          }
          row += word + " ";
        }
        draw(row);
      }
      function draw(t: string) {
        if (y < 65) {
          page = pdf.addPage([595, 842]);
          y = 790;
        }
        page.drawText(t, {
          x: 50,
          y,
          size,
          font,
          color: rgb(0.047, 0.15, 0.21),
        });
        y -= size + 7;
      }
    };
    line(kind === "quote" ? "DEVIS" : "CONTRAT DE PARTENARIAT", 22);
    line(`${data.reference} - ${data.date}`);
    line(`Emetteur : ${data.issuer}`);
    line(`Destinataire : ${data.recipient}`);
    if (kind === "quote") {
      line(`Valable jusqu'au : ${data.validUntil}`);
      for (const l of data.lines)
        line(
          `${l.label} | ${l.quantity} x ${(l.unitCents / 100).toFixed(2)} EUR HT | TVA ${l.vat}%`,
        );
      const t = totals(data);
      line(
        `HT ${(t.net / 100).toFixed(2)} EUR - TVA ${(t.tax / 100).toFixed(2)} EUR - TTC ${(t.gross / 100).toFixed(2)} EUR`,
        14,
      );
    } else {
      line(`Avantages : ${data.benefits}`);
      line(`Engagements : ${data.commitments}`);
      line(`Duree : ${data.start} - ${data.end}`);
      line(`Renouvellement : ${data.renewal}`);
      line("Signature etablissement emetteur :");
      line("Signature etablissement destinataire :");
      line("Trame a adapter. Signature interne avec preuve d acceptation.");
    }
    line(data.conditions);
  }
  for (const f of data.fields) {
    const page = pdf.getPage(f.page - 1);
    if (!page) throw new Error("Page inexistante");
    const crop = page.getCropBox(),
      angle = ((page.getRotation().angle % 360) + 360) % 360;
    const width = angle === 90 || angle === 270 ? crop.height : crop.width,
      height = angle === 90 || angle === 270 ? crop.width : crop.height;
    const value = printable(f.text).replace(/\n/g, " ");
    if (
      f.x * width + font.widthOfTextAtSize(value, f.size) > width ||
      f.y * height + f.size > height
    )
      throw new Error("Champ hors page");
    const left = f.x * width,
      top = f.y * height + f.size;
    const point =
      angle === 90
        ? { x: crop.x + top, y: crop.y + left }
        : angle === 180
          ? { x: crop.x + crop.width - left, y: crop.y + top }
          : angle === 270
            ? { x: crop.x + crop.width - top, y: crop.y + crop.height - left }
            : { x: crop.x + left, y: crop.y + crop.height - top };
    page.drawText(value, {
      ...point,
      size: f.size,
      font,
      rotate: degrees(angle),
    });
  }
  return Buffer.from(await pdf.save());
}
export async function finalPDF(
  presented: Buffer,
  signatures: {
    identity: { name: string; email: string };
    signed_at: Date;
    establishment_id: number;
    drawing: number[][][];
  }[],
) {
  const pdf = await PDFDocument.load(presented),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("Preuves de signature interne", {
    x: 45,
    y: 790,
    size: 20,
    font,
  });
  signatures.forEach((s, i) => {
    const y = 720 - i * 300;
    page.drawText(printable(`${s.identity.name} - ${s.identity.email}`), {
      x: 45,
      y,
      size: 11,
      font,
    });
    page.drawText(new Date(s.signed_at).toISOString(), {
      x: 45,
      y: y - 20,
      size: 10,
      font,
    });
    for (const stroke of s.drawing)
      for (let j = 1; j < stroke.length; j++)
        page.drawLine({
          start: {
            x: 45 + stroke[j - 1][0] * 450,
            y: y - 50 - stroke[j - 1][1] * 140,
          },
          end: { x: 45 + stroke[j][0] * 450, y: y - 50 - stroke[j][1] * 140 },
          thickness: 1,
        });
  });
  return Buffer.from(await pdf.save());
}
