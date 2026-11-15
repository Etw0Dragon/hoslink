import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  documentInput,
  totals,
  makePDF,
  digest,
  signatureDrawing,
  finalPDF,
} from "../src/document-data.js";
test("Devis : calculs en centimes, arrondi de TVA et validation serveur", () => {
  const d = documentInput.parse({
    reference: "D-1",
    date: "2026-11-15",
    issuer: "Hôtel",
    recipient: "Prestataire",
    lines: [
      { label: "Test", quantity: 3, unitCents: 1999, vat: 20 },
      { label: "Demi", quantity: 0.5, unitCents: 101, vat: 5.5 },
    ],
  });
  assert.deepEqual(totals(d), { net: 6048, tax: 1202, gross: 7250 });
  assert.throws(() =>
    documentInput.parse({
      ...d,
      lines: [{ label: "X", quantity: -1, unitCents: 100, vat: 20 }],
    }),
  );
  assert.throws(() =>
    signatureDrawing.parse([
      [
        [2, 0],
        [0, 1],
      ],
    ]),
  );
});
test("PDF : fond multipage conservé, coordonnées bornées, export et signatures", async () => {
  const original = await PDFDocument.create();
  original.addPage([600, 800]);
  original.addPage([400, 500]);
  const d = documentInput.parse({
    reference: "C",
    date: "2026-11-15",
    issuer: "A",
    recipient: "B",
    fields: [{ page: 2, x: 0.25, y: 0.2, text: "Position", size: 12 }],
  });
  const bytes = await makePDF(
    d,
    "contract",
    Buffer.from(await original.save()),
  );
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getPage(1).getWidth(), 400);
  assert.equal(digest(bytes).length, 64);
  await assert.rejects(
    makePDF(
      { ...d, fields: [{ page: 3, x: 0, y: 0, text: "Invalid", size: 12 }] },
      "contract",
      bytes,
    ),
  );
  await assert.rejects(
    makePDF(
      { ...d, fields: [{ page: 2, x: 1, y: 0.2, text: "Invalid", size: 12 }] },
      "contract",
      bytes,
    ),
  );
  const final = await finalPDF(bytes, [
    {
      identity: { name: "A", email: "a@example.test" },
      signed_at: new Date(),
      establishment_id: 1,
      drawing: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    },
  ]);
  assert.equal((await PDFDocument.load(final)).getPageCount(), 3);
  assert.notEqual(digest(final), digest(bytes));
});
