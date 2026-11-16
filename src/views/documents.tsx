import { Workspace, Icon } from "./workspace.js";
import type { Identity } from "../types.js";
import { totals } from "../document-data.js";
type Row = Record<string, any>;
export function DocumentsView({
  u,
  csrf,
  kind,
  items,
  templates,
  establishments,
  doc,
  versions,
  conversations,
  conversation,
}: {
  u: Identity;
  csrf: string;
  kind: string;
  items: Row[];
  templates: Row[];
  establishments: Row[];
  doc: Row | null;
  versions: Row[];
  conversations: Row[];
  conversation: string;
}) {
  const token = <input type="hidden" name="csrf" value={csrf} />;
  const owner = u.Role === "owner",
    editable =
      doc &&
      owner &&
      Number(doc.author_id) === u.ID &&
      Number(doc.establishment_id) === u.EstID;
  const form = (action: string, label: string, extra?: any) => (
    <form method="post" action={action}>
      {token}
      {extra}
      <button>{label}</button>
    </form>
  );
  const fields = [
    ["reference", "Référence"],
    ["date", "Date"],
    ["validUntil", "Validité du devis"],
    ["issuer", "Identité émettrice"],
    ["recipient", "Identité destinataire"],
    ["benefits", "Avantages clients"],
    ["commitments", "Engagements"],
    ["start", "Début"],
    ["end", "Fin"],
    ["renewal", "Renouvellement"],
    ["conditions", "Conditions complémentaires"],
  ] as const;
  const isQuote = (doc?.kind || kind) === "quote";
  const collection = isQuote ? "/devis" : "/contrats";
  const visibleItems = items.filter((d) => d.kind === kind);
  const visibleTemplates = templates.filter((t) => t.kind === kind);
  const renderField = ([key, label]: (typeof fields)[number]) => (
    <label
      class={
        [
          "issuer",
          "recipient",
          "conditions",
          "benefits",
          "commitments",
          "renewal",
        ].includes(key)
          ? "document-wide"
          : ""
      }
    >
      {label}
      {[
        "issuer",
        "recipient",
        "conditions",
        "benefits",
        "commitments",
        "renewal",
      ].includes(key) ? (
        <textarea
          data-field={key}
          rows={key === "conditions" ? 4 : 3}
          maxlength={10000}
        >
          {doc?.draft[key]}
        </textarea>
      ) : (
        <input
          data-field={key}
          type={
            ["date", "validUntil", "start", "end"].includes(key)
              ? "date"
              : "text"
          }
          value={doc?.draft[key]}
        />
      )}
    </label>
  );
  return (
    <Workspace
      title={doc?.title || (kind === "quote" ? "Devis" : "Contrats")}
      current={
        doc?.kind === "contract" || kind === "contract" ? "contracts" : "quotes"
      }
      user={u}
      csrf={csrf}
    >
      <link rel="stylesheet" href="/static/documents.css?v=atelier-2" />
      <script type="module" src="/static/documents.js?v=atelier-2" />
      <div class="page-heading document-heading">
        <div>
          {doc ? (
            <a class="document-back" href={collection}>
              ← Tous les {isQuote ? "devis" : "contrats"}
            </a>
          ) : (
            <span class="document-eyebrow">VOTRE ESPACE DOCUMENTS</span>
          )}
          <h1>
            {doc?.title || (kind === "quote" ? "Vos devis" : "Vos contrats")}
          </h1>
          <p>
            {doc
              ? "Préparez votre document, vérifiez-le puis partagez-le avec votre partenaire."
              : isQuote
                ? "De la première proposition à l’accord de votre partenaire."
                : "Posez les bases de vos partenariats et retrouvez vos signatures."}
          </p>
        </div>
        {editable && (
          <div class="document-heading-actions">
            <span class="badge document-private">
              <Icon name="security" /> Brouillon privé
            </span>
            <a class="button" href="#document-share">
              {isQuote ? "Partager le devis" : "Faire signer le contrat"}{" "}
              <Icon name="arrow" />
            </a>
          </div>
        )}
      </div>
      {!doc ? (
        <>
          {owner && (
            <section class="card document-create">
              <div>
                <span class="document-eyebrow">NOUVEAU DOCUMENT</span>
                <h2>
                  {isQuote
                    ? "Une proposition à partager ?"
                    : "Un partenariat à concrétiser ?"}
                </h2>
                <p>
                  Choisissez votre partenaire et partez d’une trame ou d’un
                  modèle de votre établissement.
                </p>
              </div>
              <form method="post" action="/atelier/creer">
                {token}
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="conversation" value={conversation} />
                <label>
                  Destinataire
                  <select name="recipient" required>
                    {establishments.map((e) => (
                      <option value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Modèle
                  <select name="template">
                    <option value="">Trame Hoslink à adapter</option>
                    {templates
                      .filter((t) => t.kind === kind)
                      .map((t) => (
                        <option value={t.id}>{t.name}</option>
                      ))}
                  </select>
                </label>
                <button>
                  Créer {kind === "quote" ? "mon devis" : "mon contrat"}
                </button>
              </form>
            </section>
          )}
          <section class="card document-library">
            <div class="section-heading">
              <h2>{isQuote ? "Tous vos devis" : "Tous vos contrats"}</h2>
              <span class="badge">
                {visibleItems.length} document
                {visibleItems.length > 1 ? "s" : ""}
              </span>
            </div>
            {visibleItems.length ? (
              visibleItems.map((d) => (
                <a class="document-list-row" href={`/atelier/${d.id}`}>
                  <span class="document-list-icon">
                    <Icon name="offers" />
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.current_version
                        ? `Version ${d.current_version} partagée`
                        : "Brouillon privé"}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </a>
              ))
            ) : (
              <div class="empty">
                <h3>
                  {isQuote
                    ? "Votre prochain devis commence ici"
                    : "Vos partenariats prennent forme ici"}
                </h3>
                <p>
                  {owner
                    ? "Créez votre premier document avec le formulaire ci-dessus."
                    : "Les documents partagés avec votre établissement apparaîtront ici."}
                </p>
              </div>
            )}
          </section>
          <section class="card document-library document-templates">
            <h2>Vos modèles réutilisables</h2>
            <p>
              Les trames de votre établissement, prêtes pour vos prochains
              échanges.
            </p>
            {!visibleTemplates.length && (
              <p class="empty">
                Aucun modèle pour le moment. Enregistrez un document comme
                modèle depuis l’atelier.
              </p>
            )}
            {templates
              .filter((t) => t.kind === kind)
              .map((t) => (
                <article>
                  <strong>{t.name}</strong>
                  {owner && (
                    <div class="document-actions">
                      {form(`/atelier/modeles/${t.id}/dupliquer`, "Dupliquer")}
                      {form(
                        `/atelier/modeles/${t.id}/renommer`,
                        "Renommer",
                        <input
                          name="name"
                          aria-label="Nouveau nom"
                          value={t.name}
                          required
                          maxlength={150}
                        />,
                      )}
                      {form(`/atelier/modeles/${t.id}/supprimer`, "Supprimer")}
                    </div>
                  )}
                </article>
              ))}
          </section>
        </>
      ) : (
        <>
          {editable && (
            <section
              class="document-editor"
              data-document-editor
              data-id={doc.id}
              data-revision={doc.revision}
              data-original={!!doc.original_pdf}
              data-kind={doc.kind}
            >
              <div class="card document-settings">
                <div class="document-settings-head">
                  <div>
                    <span class="document-eyebrow">ATELIER HOSLINK</span>
                    <h2>Votre document</h2>
                  </div>
                  <span data-save-status role="status" aria-live="polite">
                    Enregistré
                  </span>
                </div>
                <p class="document-help">
                  Sauvegarde automatique. Votre brouillon reste privé jusqu’à
                  l’envoi.
                </p>
                <section class="document-section">
                  <h3>
                    <span>01</span> Informations générales
                  </h3>
                  <div class="document-field-grid">
                    <input type="hidden" data-csrf value={csrf} />
                    <label>
                      Titre
                      <input data-title value={doc.title} maxlength={200} />
                    </label>
                    <label>
                      Mise en page
                      <select data-field="layout" value={doc.draft.layout}>
                        {doc.kind === "quote" ? (
                          <>
                            <option value="classic">Devis classique</option>
                            <option value="modern">Devis moderne</option>
                          </>
                        ) : (
                          <option value="partnership">
                            Contrat de partenariat
                          </option>
                        )}
                      </select>
                    </label>
                    {fields
                      .filter(
                        ([key]) =>
                          ["reference", "date", "validUntil"].includes(key) &&
                          (isQuote || key !== "validUntil"),
                      )
                      .map(renderField)}
                  </div>
                </section>
                <section class="document-section">
                  <h3>
                    <span>02</span> Les parties
                  </h3>
                  <div class="document-field-grid">
                    {fields
                      .filter(([key]) => ["issuer", "recipient"].includes(key))
                      .map(renderField)}
                  </div>
                </section>
                <section class="document-section">
                  <h3>
                    <span>03</span>{" "}
                    {isQuote
                      ? "Prestations & conditions"
                      : "Conditions du partenariat"}
                  </h3>
                  {!isQuote && (
                    <div class="document-field-grid">
                      {fields
                        .filter(([key]) =>
                          [
                            "benefits",
                            "commitments",
                            "start",
                            "end",
                            "renewal",
                          ].includes(key),
                        )
                        .map(renderField)}
                    </div>
                  )}
                  {doc.kind === "quote" && (
                    <>
                      <div data-lines />
                      <button type="button" data-add-line>
                        Ajouter une prestation
                      </button>
                      <p data-totals />
                    </>
                  )}
                  {renderField(["conditions", "Conditions complémentaires"])}
                </section>
                <details
                  class="document-section document-pdf-tools"
                  open={!!doc.original_pdf}
                >
                  <summary>Personnaliser un fond PDF</summary>
                  <p>
                    Coordonnées relatives à la page : X et Y de 0 à 1 depuis le
                    coin supérieur gauche. Cliquez dans l’aperçu pour
                    positionner un texte.
                  </p>
                  <div data-pdf-fields />
                  <button type="button" data-add-field>
                    Ajouter un champ
                  </button>
                </details>
                <textarea hidden data-initial>
                  {JSON.stringify(doc.draft)}
                </textarea>
                <button type="button" data-save>
                  Enregistrer maintenant
                </button>
                <p>
                  Trames et clauses à adapter avant utilisation. Elles ne
                  constituent pas une validation juridique.
                </p>
              </div>
              <div class="card document-preview">
                <div class="document-preview-head">
                  <h2>Aperçu du document</h2>
                  <span class="badge">En direct</span>
                </div>
                <p class="document-help">
                  Vérifiez le contenu avant de l’envoyer.
                </p>
                <div data-live-preview />
                <div data-pdf-pages />
              </div>
            </section>
          )}
          {editable && (
            <div class="document-tools">
              <form
                method="post"
                action={`/atelier/${doc.id}/importer`}
                enctype="multipart/form-data"
              >
                <h2>Votre propre mise en page</h2>
                <p>
                  Importez un fond PDF, puis ajoutez vos textes depuis
                  l’atelier.
                </p>
                {token}
                <input
                  type="hidden"
                  name="revision"
                  value={doc.revision}
                  data-revision-field
                />
                <label>
                  Importer un PDF de fond (5 Mo)
                  <input
                    name="pdf"
                    type="file"
                    accept="application/pdf"
                    required
                  />
                </label>
                <button>Analyser et importer</button>
              </form>
              {form(
                `/atelier/${doc.id}/modele`,
                "Enregistrer comme modèle",
                <>
                  <h2>Gagner du temps la prochaine fois</h2>
                  <p>Conservez cette trame pour votre établissement.</p>
                  <label>
                    Nom du modèle
                    <input name="name" value={doc.title} required />
                  </label>
                </>,
              )}
              <form
                method="post"
                action={`/atelier/${doc.id}/envoyer`}
                data-publish
                id="document-share"
              >
                <div>
                  <span class="document-eyebrow">PRÊT À PARTAGER ?</span>
                  <h2>
                    {isQuote
                      ? "Envoyer votre devis"
                      : "Faire signer votre contrat"}
                  </h2>
                  <p>
                    L’envoi crée une version figée dans votre discussion. Toute
                    modification ultérieure créera une nouvelle version.
                  </p>
                </div>
                {token}
                <input
                  type="hidden"
                  name="revision"
                  value={doc.revision}
                  data-revision-field
                />
                <label>
                  Discussion
                  <select name="conversation" required>
                    {conversations.map((c) => (
                      <option
                        value={c.id}
                        selected={Number(c.id) === Number(doc.conversation_id)}
                      >
                        {c.subject}
                      </option>
                    ))}
                  </select>
                </label>
                {!conversations.length && (
                  <p>
                    <a href={`/etablissements/${doc.recipient_id}`}>
                      Ouvrez une discussion avec ce partenaire
                    </a>
                    , puis rechargez cette page.
                  </p>
                )}
                <button disabled={!conversations.length}>
                  {doc.kind === "contract"
                    ? "Acter le contrat et demander les signatures"
                    : "Envoyer le devis"}
                </button>
              </form>
            </div>
          )}
          <section class="card document-library document-history">
            <h2>Historique des versions partagées</h2>
            {!versions.length && (
              <p class="empty">
                Aucune version envoyée. Votre document est encore un brouillon
                privé.
              </p>
            )}
            {versions.map((v) => {
              const base = `/atelier/${doc.id}/versions/${v.version}`;
              const statuses: Record<string, string> = {
                sent: "Envoyé",
                accepted: "Accepté",
                refused: "Refusé",
                signing: "En attente des deux signatures",
                signed: "Signé",
                superseded: "Remplacé",
              };
              return (
                <article class="document-version">
                  <h3>
                    {v.content.title} · {v.content.reference} · version{" "}
                    {v.version}
                  </h3>
                  <p>
                    {statuses[v.status]}{" "}
                    {doc.kind === "quote"
                      ? `· Montant TTC ${(totals(v.content).gross / 100).toFixed(2)} €`
                      : `· ${v.signatures}/2 signatures`}
                  </p>
                  {v.status === "signed" && (
                    <p>
                      {v.activation === "active"
                        ? "Signé — partenariat Hoslink actif"
                        : v.activation === "pending"
                          ? "Signé — activation Hoslink en attente de capacité"
                          : "Signé — partenariat suspendu ou terminé ; une nouvelle version contractuelle est nécessaire"}
                      . <a href="/partenariats">Voir le partenariat</a>
                    </p>
                  )}
                  <p class="document-hash">SHA-256 : {v.sha256}</p>
                  <a href={`${base}/pdf`} target="_blank" rel="noopener">
                    Consulter le PDF complet
                  </a>
                  {v.has_final && (
                    <p>
                      <a download="hoslink-signe.pdf" href={`${base}/final`}>
                        Télécharger le PDF final
                      </a>{" "}
                      ·{" "}
                      <a href={`${base}/preuve`} download="preuve.json">
                        Dossier de preuve
                      </a>
                    </p>
                  )}
                  {owner &&
                    v.status === "sent" &&
                    Number(doc.recipient_id) === u.EstID && (
                      <div class="document-actions">
                        {form(`${base}/accepter`, "Accepter le devis")}
                        {form(`${base}/refuser`, "Refuser le devis")}
                      </div>
                    )}
                  {owner &&
                    v.status === "signed" &&
                    v.activation === "pending" &&
                    form(`${base}/activer`, "Relancer l’activation Hoslink")}
                  {v.status === "signing" && (
                    <div
                      class="shared-pdf"
                      data-shared-pdf={`${base}/pdf`}
                      aria-label="Document complet à signer"
                    />
                  )}
                  {owner && v.status === "signing" && !v.own_signed && (
                    <div class="signature-panel">
                      <p>
                        Lisez le document complet avant signature. Le code est
                        adressé à votre email vérifié et expire après dix
                        minutes.
                      </p>
                      {form(`${base}/code`, "Recevoir mon code email")}
                      {form(`${base}/refuser`, "Refuser ce contrat")}
                      <form
                        method="post"
                        action={`${base}/signer`}
                        data-signature-form
                      >
                        {token}
                        <label class="checkbox">
                          <input
                            type="checkbox"
                            name="consent"
                            value="yes"
                            required
                          />
                          Je confirme mon pouvoir de représentation et consens à
                          signer cette version par signature interne avec preuve
                          d’acceptation.
                        </label>
                        <label>
                          Votre signature manuscrite
                          <canvas
                            width="600"
                            height="180"
                            data-signature
                            aria-label="Dessinez votre signature à la souris ou au tactile"
                          />
                        </label>
                        <button type="button" data-clear-signature>
                          Effacer la signature
                        </button>
                        <input type="hidden" name="drawing" />
                        <label>
                          Code reçu par email
                          <input
                            name="code"
                            inputmode="numeric"
                            pattern="[0-9]{6}"
                            maxlength={6}
                            required
                            autocomplete="one-time-code"
                          />
                        </label>
                        <button>Signer cette version</button>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </Workspace>
  );
}
