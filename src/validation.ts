import { z } from "zod";
export const positiveId = z.coerce.number().int().positive().safe();
export const text = (max: number, min = 1) =>
  z.string().trim().min(min).max(max);
export const establishmentInput = z.object({
  siret: z.string().regex(/^\d{14}$/),
  company: text(160),
  name: text(160),
  category: z.enum(["hotel", "ski", "spa", "activite", "autre"]),
  station: text(120),
  city: text(120),
  address: text(300),
});
export function validPDF(b: Buffer) {
  return (
    b.length > 8 &&
    b.length <= 5 * 1024 * 1024 &&
    b.subarray(0, 5).toString() === "%PDF-" &&
    b.subarray(-1024).includes(Buffer.from("%%EOF"))
  );
}
export function filters(query: Record<string, string>) {
  const f = new URLSearchParams();
  for (const k of ["q", "station", "category"]) {
    const v = (query[k] || "").trim().slice(0, k === "category" ? 20 : 120);
    if (
      v &&
      (k !== "category" ||
        ["hotel", "ski", "spa", "activite", "autre", "prestataires"].includes(v))
    )
      f.set(k, v);
  }
  return f;
}
