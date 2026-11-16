import * as pdfjs from "/static/pdfjs/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/static/pdfjs/pdf.worker.mjs";
const editor = document.querySelector("[data-document-editor]");
if (editor) {
  const data = JSON.parse(editor.querySelector("[data-initial]").value),
    csrf = editor.querySelector("[data-csrf]").value,
    id = editor.dataset.id,
    status = editor.querySelector("[data-save-status]");
  let revision = Number(editor.dataset.revision),
    timer,
    pending = false,
    blocked = false,
    saving = null,
    renderEpoch = 0;
  const el = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const number = (value) =>
    Number.isFinite(Number(value)) ? Number(value) : 0;
  function changed() {
    pending = true;
    status.textContent = "Modifications en attente…";
    preview();
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  }
  async function save() {
    if (blocked) return false;
    if (saving) {
      await saving;
      return pending ? save() : !blocked;
    }
    if (!pending) return true;
    pending = false;
    const payload = JSON.stringify(data),
      title = editor.querySelector("[data-title]").value;
    status.textContent = "Enregistrement…";
    saving = (async () => {
      try {
        const r = await fetch(`/atelier/${id}/sauver`, {
          method: "POST",
          body: new URLSearchParams({
            csrf,
            revision: String(revision),
            content: payload,
            title,
          }),
        });
        if (!r.ok) {
          if (r.status === 409) blocked = true;
          throw new Error(await r.text());
        }
        revision = (await r.json()).revision;
        document
          .querySelectorAll("[data-revision-field]")
          .forEach((n) => (n.value = revision));
        status.textContent = pending
          ? "Modifications en attente…"
          : "Enregistré";
        return true;
      } catch (e) {
        pending = true;
        status.textContent = e.message;
        return false;
      }
    })();
    const ok = await saving;
    saving = null;
    return ok && pending ? save() : ok;
  }
  document
    .querySelectorAll(
      'form[data-publish],form[action$="/modele"],form[action$="/importer"]',
    )
    .forEach((form) =>
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearTimeout(timer);
        if (await save()) form.submit();
      }),
    );
  window.addEventListener("beforeunload", (e) => {
    if (pending || saving) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  editor.querySelectorAll("[data-field]").forEach((n) =>
    n.addEventListener("input", () => {
      data[n.dataset.field] = n.value;
      changed();
    }),
  );
  editor.querySelector("[data-title]").addEventListener("input", changed);
  editor.querySelector("[data-save]").addEventListener("click", save);
  function rows() {
    const target = editor.querySelector("[data-lines]");
    if (target) {
      target.replaceChildren();
      data.lines.forEach((line, i) => {
        const row = el("fieldset");
        row.className = "document-line";
        row.append(el("legend", `Prestation ${i + 1}`));
        [
          ["label", "Prestation", "text"],
          ["quantity", "Quantité", "number"],
          ["unitCents", "Prix unitaire HT (€)", "number"],
          ["vat", "TVA (%)", "number"],
        ].forEach(([key, label, type]) => {
          const l = el("label", label),
            input = el("input");
          input.type = type;
          input.step = key === "unitCents" ? "0.01" : "any";
          input.value = key === "unitCents" ? line[key] / 100 : line[key];
          input.addEventListener("input", () => {
            line[key] =
              type === "text"
                ? input.value
                : key === "unitCents"
                  ? Math.round(number(input.value) * 100)
                  : number(input.value);
            changed();
          });
          l.append(input);
          row.append(l);
        });
        const remove = el("button", "Supprimer");
        remove.type = "button";
        remove.className = "secondary document-remove";
        remove.setAttribute("aria-label", `Supprimer la prestation ${i + 1}`);
        remove.onclick = () => {
          data.lines.splice(i, 1);
          rows();
          changed();
        };
        row.append(remove);
        target.append(row);
      });
    }
    const targetFields = editor.querySelector("[data-pdf-fields]");
    targetFields.replaceChildren();
    data.fields.forEach((field, i) => {
      const row = el("fieldset");
      [
        ["page", "Page"],
        ["x", "X (0–1)"],
        ["y", "Y (0–1)"],
        ["size", "Taille"],
        ["text", "Texte"],
      ].forEach(([key, label]) => {
        const l = el("label", label),
          input = el("input");
        input.type = key === "text" ? "text" : "number";
        input.step = ["x", "y"].includes(key) ? ".01" : "1";
        input.value = field[key];
        input.oninput = () => {
          field[key] = key === "text" ? input.value : number(input.value);
          changed();
        };
        l.append(input);
        row.append(l);
      });
      const remove = el("button", "Retirer ce champ");
      remove.type = "button";
      remove.onclick = () => {
        data.fields.splice(i, 1);
        rows();
        changed();
      };
      row.append(remove);
      targetFields.append(row);
    });
  }
  editor.querySelector("[data-add-line]")?.addEventListener("click", () => {
    data.lines.push({
      label: "Prestation",
      quantity: 1,
      unitCents: 0,
      vat: 20,
    });
    rows();
    changed();
  });
  editor.querySelector("[data-add-field]").onclick = () => {
    data.fields.push({ page: 1, x: 0.1, y: 0.1, text: "Texte", size: 12 });
    rows();
    changed();
  };
  let sourcePDF = null;
  async function preview() {
    const target = editor.querySelector("[data-live-preview]");
    target.replaceChildren();
    if (editor.dataset.original !== "true") {
      const paper = el("article");
      paper.className = "document-paper " + data.layout;
      const money = (cents) =>
        new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: "EUR",
        }).format(cents / 100);
      const date = (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value || "")
          ? value.split("-").reverse().join("/")
          : value;
      const heading = el("header");
      heading.className = "paper-heading";
      const brand = el("span", "HOSLINK");
      brand.className = "paper-brand";
      heading.append(
        brand,
        el(
          "h2",
          editor.dataset.kind === "contract"
            ? "Contrat de partenariat"
            : "Devis",
        ),
      );
      const meta = el("div");
      meta.className = "paper-meta";
      meta.append(
        el("span", data.reference || "Référence à renseigner"),
        el("span", date(data.date) || "Date à renseigner"),
      );
      heading.append(meta);
      paper.append(heading);
      const parties = el("div");
      parties.className = "paper-parties";
      for (const [label, value] of [
        ["ÉMETTEUR", data.issuer],
        ["DESTINATAIRE", data.recipient],
      ]) {
        const party = el("div");
        party.append(el("small", label), el("p", value || "À renseigner"));
        parties.append(party);
      }
      paper.append(parties);
      if (editor.dataset.kind === "contract") {
        for (const [key, label] of [
          ["benefits", "Avantages clients"],
          ["commitments", "Engagements"],
          ["start", "Début du partenariat"],
          ["end", "Fin du partenariat"],
          ["renewal", "Renouvellement"],
        ]) {
          if (!data[key]) continue;
          const section = el("section");
          section.append(
            el("h3", label),
            el(
              "p",
              ["start", "end"].includes(key) ? date(data[key]) : data[key],
            ),
          );
          paper.append(section);
        }
      } else {
        const table = el("table");
        table.className = "paper-lines";
        const caption = el("caption", "Détail des prestations");
        const head = el("thead"),
          header = el("tr");
        for (const label of ["Prestation", "Qté", "PU HT", "TVA", "Total HT"]) {
          const cell = el("th", label);
          cell.scope = "col";
          header.append(cell);
        }
        head.append(header);
        const body = el("tbody");
        let net = 0,
          tax = 0;
        for (const line of data.lines) {
          const amount = Math.round(line.quantity * line.unitCents);
          net += amount;
          tax += Math.round((amount * line.vat) / 100);
          const row = el("tr");
          for (const text of [
            line.label,
            String(line.quantity),
            money(line.unitCents),
            `${line.vat} %`,
            money(amount),
          ])
            row.append(el("td", text));
          body.append(row);
        }
        table.append(caption, head, body);
        paper.append(table);
        if (!data.lines.length)
          paper.append(
            el("p", "Ajoutez vos prestations pour compléter ce devis."),
          );
        const summary = el("dl");
        summary.className = "paper-totals";
        for (const [label, value] of [
          ["Total HT", net],
          ["TVA", tax],
          ["Total TTC", net + tax],
        ]) {
          const row = el("div");
          row.append(el("dt", label), el("dd", money(value)));
          summary.append(row);
        }
        paper.append(summary);
        editor.querySelector("[data-totals]").textContent =
          `Total HT : ${money(net)} · TVA : ${money(tax)} · TTC : ${money(net + tax)}`;
        if (data.validUntil)
          paper.append(
            el("p", `Devis valable jusqu’au ${date(data.validUntil)}`),
          );
      }
      if (data.conditions) {
        const section = el("section");
        section.className = "paper-conditions";
        section.append(
          el("h3", "Conditions complémentaires"),
          el("p", data.conditions),
        );
        paper.append(section);
      }
      if (editor.dataset.kind === "contract") {
        const signatures = el("div");
        signatures.className = "paper-signatures";
        signatures.append(
          el("div", "Signature de l’émetteur"),
          el("div", "Signature du destinataire"),
        );
        paper.append(signatures);
      }
      const footer = el("footer", "Brouillon · Document non envoyé");
      paper.append(footer);
      target.append(paper);
    }
    if (sourcePDF) {
      const epoch = ++renderEpoch,
        pages = editor.querySelector("[data-pdf-pages]");
      pages.replaceChildren();
      for (let i = 1; i <= sourcePDF.numPages; i++) {
        const page = await sourcePDF.getPage(i);
        if (epoch !== renderEpoch) return;
        const viewport = page.getViewport({ scale: 1 }),
          canvas = el("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute("aria-label", `PDF page ${i}`);
        pages.append(canvas);
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        if (epoch !== renderEpoch) return;
        for (const f of data.fields.filter((f) => f.page === i)) {
          context.font = `${f.size}px sans-serif`;
          context.fillStyle = "#0c2635";
          context.fillText(
            f.text,
            f.x * canvas.width,
            f.y * canvas.height + f.size,
          );
        }
        canvas.onclick = (e) => {
          const r = canvas.getBoundingClientRect();
          data.fields.push({
            page: i,
            x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000,
            y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000,
            text: "Texte",
            size: 12,
          });
          rows();
          changed();
        };
      }
    }
  }
  rows();
  preview();
  if (editor.dataset.original === "true") {
    pdfjs
      .getDocument({ url: `/atelier/${id}/original`, isEvalSupported: false })
      .promise.then((p) => {
        sourcePDF = p;
        preview();
      })
      .catch(() => {
        status.textContent = "Impossible d’afficher le PDF.";
      });
  }
}
for (const form of document.querySelectorAll("[data-signature-form]")) {
  const canvas = form.querySelector("canvas"),
    ctx = canvas.getContext("2d");
  let strokes = [],
    stroke = null;
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    stroke = [point(e)];
    strokes.push(stroke);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!stroke) return;
    const p = point(e),
      prev = stroke.at(-1);
    stroke.push(p);
    ctx.beginPath();
    ctx.moveTo(prev[0] * 600, prev[1] * 180);
    ctx.lineTo(p[0] * 600, p[1] * 180);
    ctx.stroke();
  });
  const finish = () => {
    stroke = null;
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  form.querySelector("[data-clear-signature]").onclick = () => {
    strokes = [];
    ctx.clearRect(0, 0, 600, 180);
  };
  form.addEventListener("submit", (e) => {
    const valid = strokes.filter((s) => s.length > 1);
    if (!valid.length) {
      e.preventDefault();
      alert("Dessinez votre signature avant de confirmer.");
      return;
    }
    form.querySelector("[name=drawing]").value = JSON.stringify(valid);
  });
}

for (const target of document.querySelectorAll("[data-shared-pdf]")) {
  try {
    const pdf = await pdfjs.getDocument({
      url: target.dataset.sharedPdf,
      isEvalSupported: false,
    }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        viewport = page.getViewport({ scale: 1 }),
        canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.setAttribute("aria-label", `Document à signer, page ${i}`);
      target.append(canvas);
      await page.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
    }
  } catch {
    target.textContent =
      "Aperçu indisponible. Consultez le PDF complet via le lien ci-dessus avant signature.";
  }
}
