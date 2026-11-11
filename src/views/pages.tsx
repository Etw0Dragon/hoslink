// Converted from the original HTML templates; interpolation is escaped by Hono.
import { html } from "hono/html";
import { Workspace, AccessLayout } from "./workspace.js";
export type ViewData = Record<string, any>;
const truth = (v: any) => (Array.isArray(v) ? v.length > 0 : !!v);
const category = (v: string) =>
  (
    ({
      hotel: "Hôtel",
      ski: "Location de skis",
      spa: "Spa & bien-être",
      activite: "Activités",
      autre: "Autres services",
    }) as Record<string, string>
  )[v] ?? v;
const status = (v: string) =>
  (
    ({
      pending: "En attente",
      approved: "Validé",
      suspended: "Suspendu",
      active: "Actif",
      ended: "Terminé",
    }) as Record<string, string>
  )[v] ?? v;
const initial = (v: string) => [...(v || "?")][0];
const views: Record<string, (d: any, p: ViewData) => any> = {};
views["account"] = (d, p) =>
  html`<div class="page-heading">
      <div>
        <h1>Mon établissement.</h1>
        <p>
          Votre présence dans le réseau et les informations de votre structure.
          ${truth(d.TestProd) ? html`<strong>Mode de recette : les nouveaux établissements sont validés automatiquement.</strong>` : html``}
        </p>
      </div>
    </div>
    ${
      truth(!truth(d.User.Verified))
        ? html`<div class="notice">
            Confirmez votre adresse email grâce au lien reçu avant de créer
            votre établissement. Le lien expire après 24 heures.
            <form action="/renvoyer-verification" method="post">
              ${views["csrf"](d, p)}<button>Recevoir un nouveau lien</button>
            </form>
          </div>`
        : html` ${
              truth(d.User.EstID)
                ? html`<div class="card">
                    <div class="split">
                      <h2>${d.User.EstName}</h2>
                      <span class="badge">${status(d.User.Status)}</span>
                    </div>
                    ${truth(d.User.Status === "pending") ? html`<p>Votre fiche sera publiée après contrôle de l’entreprise et de votre qualité de représentant par notre équipe.</p>` : truth(d.User.Status === "suspended") ? html`<p>L’accès de votre établissement est suspendu. Contactez l’administrateur pour régulariser la situation.</p>` : html`<a class="button" href="/etablissements/${d.User.EstID}">Voir ma fiche ↗</a>`}
                  </div>`
                : html``
            }
            ${
              truth(d.Establishments)
                ? html`<section class="card">
                    <h2>Mes établissements</h2>
                    <form action="/changer" method="post" class="inline-form">
                      ${views["csrf"](d, p)}<label
                        >Établissement actif<select name="establishment">
                          ${d.Establishments?.length ? d.Establishments.map((row: ViewData) => html`<option value="${row.ID}" ${truth(p.User.EstID === row.ID) ? html`selected` : html``}>${row.Name} · ${status(row.Status)}</option>`) : html``}
                        </select></label
                      ><button>Changer d’établissement</button>
                    </form>
                  </section>`
                : html``
            }
            <details
              class="card"
              ${truth(!truth(d.Establishments)) ? html`open` : html``}
            >
              <summary>Présenter un nouvel établissement</summary>
              <p>
                Vous rejoignez une structure existante ? Demandez une invitation
                à son responsable. Le SIRET seul ne permet pas de la
                revendiquer.
              </p>
              <form action="/etablissement" method="post">
                ${views["csrf"](d, p)}
                <div class="two-col">
                  <label
                    >Raison sociale<input
                      name="company"
                      required
                      maxlength="160" /></label
                  ><label
                    >Nom de l’établissement<input
                      name="name"
                      required
                      maxlength="160" /></label
                  ><label
                    >SIRET<input
                      name="siret"
                      required
                      pattern="[0-9 ]{14,20}"
                      inputmode="numeric" /></label
                  ><label
                    >Activité<select name="category">
                      ${views["categories"](d, p)}
                    </select></label
                  ><label
                    >Localisation<input
                      name="station"
                      required
                      maxlength="100" /></label
                  ><label
                    >Commune<input name="city" required maxlength="100"
                  /></label>
                </div>
                <label
                  >Adresse professionnelle<input
                    name="address"
                    required
                    maxlength="250" /></label
                ><label
                  >Présentation<textarea
                    name="description"
                    maxlength="3000"
                    rows="4"
                  ></textarea></label
                ><label class="check"
                  ><input type="checkbox" required />Je suis autorisé à
                  représenter cet établissement.</label
                ><button>Soumettre à validation ↗</button>
              </form>
            </details>`
    }`;
views["admin"] = (d, p) =>
  html`<h1>Validation des professionnels.</h1>
    <p>
      Vérifiez l’existence de l’établissement et l’autorisation de son
      représentant avant publication.
    </p>
    ${
      d.Items?.length
        ? d.Items.map(
            (row: ViewData) =>
              html`<section class="card">
                <div class="split">
                  <h2>${row.Name}</h2>
                  <span class="badge">${status(row.Status)}</span>
                </div>
                <p>
                  ${row.Description} · SIRET ${row.Subject}<br />${row.Body},
                  ${row.City} · ${row.Station}
                </p>
                <form method="post" action="/administration/${row.ID}">
                  ${views["csrf"](p, p)}<label
                    >Décision<select name="status">
                      <option value="approved">Valider l’établissement</option>
                      <option value="suspended">Suspendre l’accès</option>
                    </select></label
                  ><label
                    >Justification et vérification du représentant<textarea
                      name="note"
                      required
                      maxlength="1000"
                      rows="3"
                    ></textarea></label
                  ><button>Enregistrer la décision</button>
                </form>
              </section>`,
          )
        : html`<div class="empty card">Aucun dossier pour le moment.</div>`
    }
    <section class="card">
      <h2>Signalements et journal des décisions</h2>
      ${
        d.Messages?.length
          ? d.Messages.map(
              (row: ViewData) =>
                html`<article class="member">
                  <div>
                    <strong
                      >${row.Subject} · établissement / accord ${row.ID}</strong
                    ><small>${row.Name} · ${row.Date}</small>
                    <p class="pre">${row.Body}</p>
                  </div>
                </article>`,
            )
          : html`<p>Aucun événement enregistré.</p>`
      }
    </section>`;
views["auth"] = (d, p) =>
  html`<div class="auth-wrap">
    <h1>
      ${truth(d.Page === "inscription") ? html`Vos prochaines relations<br />commencent ici.` : truth(d.Page === "connexion") ? html`Heureux de vous revoir.` : html`Votre espace professionnel`}
    </h1>
    <div class="card auth-card">
      ${
        truth(d.Page === "inscription")
          ? html`<h2>Créer mon compte</h2>
              <p>Créez votre compte, puis présentez votre établissement.</p>
              <form method="post" action="/inscription">
                ${views["csrf"](d, p)}<label
                  >Votre nom<input
                    name="name"
                    required
                    maxlength="120"
                    autocomplete="name" /></label
                ><label
                  >Email professionnel<input
                    type="email"
                    name="email"
                    required
                    autocomplete="email" /></label
                ><label
                  >Mot de passe<input
                    type="password"
                    name="password"
                    required
                    minlength="12"
                    maxlength="72"
                    autocomplete="new-password" /></label
                ><small>12 caractères minimum, 72 octets maximum.</small
                ><button>Créer mon compte ↗</button>
              </form>
              <p>Déjà inscrit ? <a href="/connexion">Se connecter</a></p> `
          : truth(d.Page === "connexion")
            ? html`<h2>Se connecter</h2>
                <form method="post" action="/connexion">
                  ${views["csrf"](d, p)}<label
                    >Email<input
                      type="email"
                      name="email"
                      required
                      autocomplete="email" /></label
                  ><label
                    >Mot de passe<input
                      type="password"
                      name="password"
                      required
                      maxlength="72"
                      autocomplete="current-password" /></label
                  ><button>Accéder à mon espace ↗</button>
                </form>
                <p><a href="/mot-de-passe">Mot de passe oublié ?</a></p>
                <p>
                  Pas encore de compte ?
                  <a href="/inscription">Rejoindre le réseau</a>
                </p> `
            : truth(d.Page === "mot-de-passe")
              ? html`<h2>Retrouver mon accès</h2>
                  <form method="post" action="/mot-de-passe">
                    ${views["csrf"](d, p)}<label
                      >Email<input type="email" name="email" required /></label
                    ><button>Recevoir un lien</button>
                  </form> `
              : truth(d.Page === "reinitialiser")
                ? html`<h2>Choisir un nouveau mot de passe</h2>
                    <form method="post" action="/reinitialiser">
                      ${views["csrf"](d, p)}<input
                        type="hidden"
                        name="token"
                        value="${d.Token}"
                      /><label
                        >Nouveau mot de passe<input
                          type="password"
                          name="password"
                          required
                          minlength="12"
                          maxlength="72"
                          autocomplete="new-password" /></label
                      ><button>Enregistrer</button>
                    </form> `
                : truth(d.Page === "verifier")
                  ? html`<h2>Confirmer mon email</h2>
                      <p>
                        Confirmez votre adresse pour préparer votre fiche
                        professionnelle.
                      </p>
                      <form method="post" action="/verifier">
                        ${views["csrf"](d, p)}<input
                          type="hidden"
                          name="token"
                          value="${d.Token}"
                        /><button>Confirmer mon adresse</button>
                      </form> `
                  : truth(d.Page === "invitation")
                    ? html`<h2>Rejoindre une équipe</h2>
                        <p>
                          Connectez-vous avec l’adresse destinataire de
                          l’invitation, puis revenez sur ce lien.
                        </p>
                        <form method="post" action="/invitation">
                          ${views["csrf"](d, p)}<input
                            type="hidden"
                            name="token"
                            value="${d.Token}"
                          /><button>Accepter l’invitation</button>
                        </form>
                        <p>
                          <a href="/connexion">Se connecter</a> ·
                          <a href="/inscription">Créer un compte</a>
                        </p>`
                    : html``
      }
    </div>
  </div>`;
views["conversation"] = (d, p) =>
  html`<a class="back" href="/messages">← Tous les échanges</a>
    <h1>${d.Item.Subject}</h1>
    <div class="thread">
      ${
        d.Messages?.length
          ? d.Messages.map(
              (row: ViewData) =>
                html`<article class="message card">
                  <div class="split">
                    <strong>${row.Name}</strong><small>${row.Date}</small>
                  </div>
                  <p class="pre">${row.Body}</p>
                  ${truth(row.OtherID) ? html`<a class="attachment" href="/documents/${row.OtherID}">↓ ${row.FileName}</a>` : html``}
                </article>`,
            )
          : html``
      }
    </div>
    <section class="card">
      <h2>Poursuivre l’échange</h2>
      <form
        action="/messages/${d.Item.ID}"
        method="post"
        enctype="multipart/form-data"
      >
        ${views["csrf"](d, p)}<label
          >Message<textarea
            name="body"
            maxlength="10000"
            rows="4"
          ></textarea></label
        ><label
          >Joindre un devis PDF · 5 Mo maximum<input
            type="file"
            name="document"
            accept="application/pdf,.pdf" /></label
        ><button>Envoyer ↗</button>
      </form>
    </section>`;
views["conversations"] = (d, p) =>
  html`<div class="page-heading">
      <div>
        <h1>Messages & devis.</h1>
        <p>Faites avancer vos projets avec les équipes de vos partenaires.</p>
      </div>
      <a class="button secondary" href="/annuaire"
        >Contacter un professionnel ${views["arrow"](d, p)}</a
      >
    </div>
    <div class="card">
      ${
        d.Items?.length
          ? d.Items.map(
              (row: ViewData) =>
                html`<a class="conversation-row" href="/messages/${row.ID}"
                  ><div>
                    <strong>${row.Name}</strong>
                    <p>${row.Subject}</p>
                  </div>
                  <span
                    >${truth(row.Quote) ? html`<span class="badge">Devis</span>` : html``}
                    <small>${row.Date}</small> ↗</span
                  ></a
                >`,
            )
          : html`<div class="empty">
              <h2>Votre première conversation vous attend.</h2>
              <p>
                Découvrez le réseau et contactez un professionnel pour parler de
                vos projets.
              </p>
              <a class="button" href="/annuaire">Explorer le réseau ↗</a>
            </div>`
      }
    </div>`;
views["dashboard"] = (d, p) => html`
  <div class="page-heading">
    <div>
      <h1>Faites grandir vos relations.</h1>
      <p>Vos collaborations et vos échanges, au même endroit.</p>
    </div>
    <a class="button" href="/annuaire"
      >Trouver un partenaire ${views["arrow"](d, p)}</a
    >
  </div>
  <section class="metrics" aria-label="Votre activité">
    <a class="metric" href="/partenariats"
      ><span>Partenariats actifs</span><strong>${d.Active}</strong
      ><small>Voir vos accords ${views["arrow"](d, p)}</small></a
    >
    <a class="metric" href="/partenariats"
      ><span>Propositions à examiner</span><strong>${d.Pending}</strong
      ><small>Consulter les conditions ${views["arrow"](d, p)}</small></a
    >
    <a class="metric" href="/offres"
      ><span>Capacité de votre établissement</span
      ><strong
        >${truth(d.Unlimited) ? html`Illimitée` : html`${d.Active} <span>/ ${d.Slots}</span>`}</strong
      ><small
        >${truth(d.Unlimited) ? html`Abonnement en cours` : html`Places utilisées`}
        ${views["arrow"](d, p)}</small
      ></a
    >
  </section>
  <section class="card activity-panel">
    <div class="split">
      <div>
        <h2>Derniers échanges</h2>
        <p>Conversations classées par dernière activité.</p>
      </div>
      <a class="text-action" href="/messages"
        >Tous les messages ${views["arrow"](d, p)}</a
      >
    </div>
    ${
      d.Messages?.length
        ? d.Messages.map(
            (row: ViewData) =>
              html`<a class="conversation-row" href="/messages/${row.ID}"
                ><span class="avatar" aria-hidden="true"
                  >${initial(row.Name)}</span
                >
                <div>
                  <strong>${row.Name}</strong>
                  <p>${row.Subject}</p>
                </div>
                <span
                  >${truth(row.Quote) ? html`<span class="badge">Devis</span>` : html``}<small
                    >${row.Date}</small
                  ></span
                >${views["arrow"](d, p)}</a
              > `,
          )
        : html`<div class="empty compact">
            <h3>Un premier échange ouvre des possibilités.</h3>
            <p>
              Contactez un professionnel depuis sa fiche pour présenter votre
              projet ou demander un devis.
            </p>
            <a class="text-action" href="/annuaire"
              >Découvrir le réseau ${views["arrow"](d, p)}</a
            >
          </div>`
    }
  </section>
  <section aria-labelledby="discovery-heading">
    <div class="section-title">
      <div>
        <h2 id="discovery-heading">À découvrir dans le réseau</h2>
        <p>Les derniers établissements validés.</p>
      </div>
      <a class="text-action" href="/annuaire"
        >Tout l’annuaire ${views["arrow"](d, p)}</a
      >
    </div>
    <div class="grid">
      ${
        d.Items?.length
          ? d.Items.map((row: ViewData) => html`${views["listing"](row, p)}`)
          : html`<div class="card empty compact">
              <h3>Le réseau se construit avec vous.</h3>
              <p>Les établissements apparaîtront ici après leur validation.</p>
            </div>`
      }
    </div>
  </section>
`;
views["directory"] = (d, p) => html`
  <section class="discovery-hero"><h1>Trouvez le bon partenaire<br />ou le bon hôtel.</h1><p>Développez votre réseau et créez de nouvelles collaborations.</p>
  <form action="/annuaire" role="search" class="discovery-search">
    <div class="discovery-tabs" aria-label="Type d’établissement"><button name="category" value="prestataires" class="${d.Category !== 'hotel' ? 'selected' : ''}">Prestataires</button><button name="category" value="hotel" class="${d.Category === 'hotel' ? 'selected' : ''}">Hôtels</button></div>
    <div class="discovery-search-fields"><label>Mots-clés<input name="q" value="${d.Query || ''}" placeholder="Un nom, un service…" /></label><label>Localisation<input name="station" value="${d.Station || ''}" placeholder="Ville ou destination" /></label><button name="category" value="${d.Category || ''}">Rechercher</button></div>
  </form><nav class="discovery-quick" aria-label="Catégories rapides">${[['hotel','Hôtels'],['ski','Location de skis'],['spa','Bien-être & spa'],['activite','Activités'],['autre','Autres services']].map(([value,label])=>html`<a href="/annuaire?category=${value}">${label}</a>`)}</nav></section>
  <div class="discovery-content"><aside class="discovery-filters"><div class="split"><h2>Filtres</h2><a href="/annuaire">Réinitialiser</a></div><form action="/annuaire"><input type="hidden" name="q" value="${d.Query || ''}"/><label>Activité<select name="category"><option value="">Toutes les activités</option>${[['prestataires','Tous les prestataires'],['hotel','Hôtels'],['ski','Location de skis'],['spa','Spa & bien-être'],['activite','Activités'],['autre','Autres services']].map(([value,label])=>html`<option value="${value}" ${truth(d.Category===value)?html`selected`:html``}>${label}</option>`)}</select></label><label>Localisation<input name="station" value="${d.Station || ''}" placeholder="Ville ou destination"/></label><button>Appliquer les filtres</button></form></aside>
  <section class="discovery-results"><div class="results-heading"><h2>${d.Items?.length ?? 0} résultat${truth((d.Items?.length ?? 0)!==1)?html`s`:html``}</h2>${truth((d.Items?.length ?? 0)===100)?html`<span>100 premiers affichés</span>`:html``}</div><div class="discovery-list">${d.Items?.length?d.Items.map((row: ViewData)=>html`<article class="discovery-row"><div class="discovery-image"><img src="${views['activity-image'](row.Category,p)}" alt="" loading="lazy"/><span>Illustration d’activité</span></div><div class="discovery-row-body"><h3><a href="/etablissements/${row.ID}">${row.Name}</a></h3><span class="discovery-category">${category(row.Category)}</span><p class="discovery-location">${row.Station}${truth(row.Station && row.City)?html` · `:html``}${row.City}</p><p>${row.Description || 'Présentation à compléter.'}</p><a class="button secondary" href="/etablissements/${row.ID}">Voir la fiche et contacter</a></div></article>`):html`<div class="empty"><h2>Aucun résultat pour cette recherche.</h2><p>Modifiez les filtres pour découvrir d’autres professionnels.</p><a href="/annuaire" class="button secondary">Réinitialiser les filtres</a></div>`}</div></section></div>`;
views["history"] = (d, p) =>
  html`<a class="back" href="/partenariats">← Mes partenariats</a>
    <h1>Historique des conditions.</h1>
    ${
      d.Items?.length
        ? d.Items.map(
            (row: ViewData) =>
              html`<article class="card">
                <h2>Version ${row.Version}</h2>
                <small>${row.Name} · ${row.Date}</small>
                <p class="pre">${row.Terms}</p>
              </article>`,
          )
        : html``
    }`;
views["home"] = (d, p) => html`
  <section class="market-hero" aria-labelledby="hero-title">
    <div class="market-hero-copy">
      <h1 id="hero-title">
        Une plateforme dédiée à l’hôtellerie<br />et au tourisme.
      </h1>
      <p>
        Trouvez les bons partenaires, échangez, collaborez et développez votre
        activité dans un réseau 100 % professionnel.
      </p>
      <div class="hero-actions">
        <a class="button" href="#fonctionnement">Découvrir la plateforme</a
        ><a class="hero-secondary" href="/inscription">Créer un compte</a>
      </div>
      <div class="hero-search-area">
        <div class="hero-search-types">
          <a href="/recherche?category=hotel"
            >${views["hotel-icon"](d, p)} Hôtels</a
          ><a href="/recherche">${views["service-icon"](d, p)} Prestataires</a
          ><a href="#fonctionnement"
            >${views["link-icon"](d, p)} Partenariats</a
          >
        </div>
        <form
          class="market-search"
          method="get"
          action="/recherche"
          role="search"
          aria-label="Trouver un partenaire"
        >
          <label
            >${views["search-icon"](d, p)}<span class="visually-hidden"
              >Quel partenaire recherchez-vous ?</span
            ><input
              name="q"
              maxlength="160"
              placeholder="Rechercher un prestataire, une activité…"
              autocomplete="off"
          /></label>
          <button type="submit">Rechercher</button>
        </form>
        <p class="search-privacy">
          Annuaire privé réservé aux professionnels validés.
        </p>
      </div>
    </div>
    <div class="hero-photography">
      <img
        class="hero-main-photo"
        src="/static/media/hotel.webp"
        alt="Illustration d’un hôtel ensoleillé avec terrasse et piscine"
        width="768"
        height="512"
        fetchpriority="high"
      />
      <img
        class="hero-detail-photo"
        src="/static/media/hospitality.webp"
        alt="Illustration d’une terrasse de restaurant"
        width="768"
        height="512"
      />
      <img
        class="hero-small-photo"
        src="/static/media/wellness.webp"
        alt="Illustration d’un espace bien-être"
        width="768"
        height="512"
      />
      <span class="hero-image-caption">Visuels d’illustration</span>
    </div>
  </section>
  <section class="network-benefits" aria-label="Le réseau Hoslink">
    <a href="/recherche?category=hotel"
      >${views["hotel-icon"](d, p)}<span>Hôtels & établissements</span></a
    >
    <a href="/recherche"
      >${views["service-icon"](d, p)}<span>Prestataires & fournisseurs</span></a
    >
    <a href="#fonctionnement"
      >${views["link-icon"](d, p)}<span>Projets & collaborations</span></a
    >
    <a href="#reseau"
      >${views["shield-icon"](d, p)}<span>Un réseau professionnel</span></a
    >
  </section>
  <section
    class="market-categories"
    id="reseau"
    aria-labelledby="categories-title"
  >
    <div class="market-section-heading">
      <h2 id="categories-title">
        À chaque métier,<br />de nouvelles possibilités.
      </h2>
      <p>
        Votre prochain partenaire exerce peut-être<br />juste à côté de vous.
      </p>
    </div>
    <div class="category-gallery">
      <a class="category-tile" href="/recherche?category=hotel"
        ><img
          src="/static/media/hotel.webp"
          width="768"
          height="512"
          alt=""
          loading="lazy"
        />
        <div>
          <h3>Hôtels & hébergements</h3>
          <span>Enrichir chaque séjour ${views["arrow"](d, p)}</span>
        </div></a
      >
      <a class="category-tile" href="/recherche?category=activite"
        ><img
          src="/static/media/activities.webp"
          width="768"
          height="512"
          alt=""
          loading="lazy"
        />
        <div>
          <h3>Activités & loisirs</h3>
          <span>Créer de beaux souvenirs ${views["arrow"](d, p)}</span>
        </div></a
      >
      <a class="category-tile" href="/recherche?category=spa"
        ><img
          src="/static/media/wellness.webp"
          width="768"
          height="512"
          alt=""
          loading="lazy"
        />
        <div>
          <h3>Spa & bien-être</h3>
          <span>Prolonger la détente ${views["arrow"](d, p)}</span>
        </div></a
      >
      <a class="category-tile" href="/recherche?category=autre"
        ><img
          src="/static/media/hospitality.webp"
          width="768"
          height="512"
          alt=""
          loading="lazy"
        />
        <div>
          <h3>Services & savoir-faire</h3>
          <span>Imaginer la suite ${views["arrow"](d, p)}</span>
        </div></a
      >
    </div>
    <p class="media-disclosure">
      Visuels d’illustration créés pour Hoslink ; ils ne représentent pas les
      établissements inscrits.
    </p>
  </section>
  <section class="market-story" id="concept">
    <div class="story-image">
      <img
        src="/static/media/hospitality.webp"
        width="768"
        height="512"
        alt="Illustration d’un professionnel préparant une terrasse de restaurant"
        loading="lazy"
      />
    </div>
    <div class="story-copy">
      <h2>
        Vous connaissez votre métier.<br /><span
          >Rencontrez ceux qui le complètent.</span
        >
      </h2>
      <p>
        Une nuit à l’hôtel et une sortie en mer. Un séjour et une parenthèse
        bien-être. Les meilleures expériences naissent souvent d’une bonne
        rencontre.
      </p>
      <p>
        Hoslink rapproche les hôtels et les prestataires pour transformer une
        première discussion en une collaboration concrète.
      </p>
      <div class="partnership-tags">
        <span>Recommandations réciproques</span><span>Réductions clients</span
        ><span>Commissions d’apport</span><span>Offres communes</span>
      </div>
      <a class="text-action" href="/inscription"
        >Créer les bons liens ${views["arrow"](d, p)}</a
      >
    </div>
  </section>
  <section class="market-film" id="fonctionnement">
    <div class="film-heading">
      <h2>Moins de recherches.<br />Plus de rencontres.</h2>
      <p>
        De la découverte au partenariat, un même espace pour avancer ensemble.
      </p>
    </div>
    <div class="film-layout">
      <div id="film" class="film-player">
        <video
          controls
          playsinline
          preload="none"
          poster="/static/media/film-poster.webp"
          width="1280"
          height="720"
          aria-label="Découvrir le fonctionnement de Hoslink en 18 secondes"
          aria-describedby="film-transcript"
        >
          <source
            src="/static/media/hotlink-introduction.mp4"
            type="video/mp4"
          />
          <track
            kind="captions"
            src="/static/media/introduction.fr.vtt"
            srclang="fr"
            label="Français"
            default
          />
          Votre navigateur ne peut pas lire cette vidéo. Le parcours est décrit
          ci-dessous.</video
        ><span>Le réseau Hoslink, en 18 secondes.</span>
      </div>
      <ol class="journey-steps" id="film-transcript">
        <li>
          <h3>Présentez votre établissement.</h3>
          <p>
            Créez votre fiche. Notre équipe vérifie votre activité et votre
            qualité de représentant avant votre entrée dans le réseau.
          </p>
        </li>
        <li>
          <h3>Faites connaissance.</h3>
          <p>
            Recherchez par activité et destination. Contactez une équipe,
            échangez et demandez un devis.
          </p>
        </li>
        <li>
          <h3>Construisez votre partenariat.</h3>
          <p>
            Proposez vos conditions et validez votre accord à deux, dans la
            limite des places disponibles.
          </p>
        </li>
      </ol>
    </div>
  </section>
  <section class="market-offer" id="offre">
    <div>
      <h2>Vos deux premiers<br />partenariats ? <span>Offerts.</span></h2>
      <p>
        Commencez avec deux partenariats actifs gratuits par établissement. Les
        conversations et les demandes de devis sont libres.
      </p>
      <a class="button" href="/inscription"
        >Rejoindre le réseau ${views["arrow"](d, p)}</a
      ><small
        >Des places supplémentaires et une offre illimitée sont prévues. Tarifs
        à définir, aucun achat activé.</small
      >
    </div>
    <div class="offer-promises">
      <div>
        ${views["shield-icon"](d, p)}
        <h3>Un réseau professionnel privé</h3>
        <p>Chaque établissement est validé manuellement.</p>
      </div>
      <div>
        ${views["message-icon"](d, p)}
        <h3>Vos échanges, au bon endroit</h3>
        <p>
          Conversations, devis PDF et conditions partagés entre les équipes
          concernées.
        </p>
      </div>
      <div>
        ${views["link-icon"](d, p)}
        <h3>Un accord construit à deux</h3>
        <p>Les deux partenaires acceptent les conditions avant l’activation.</p>
      </div>
    </div>
  </section>
  <section class="market-faq">
    <h2>Faisons connaissance.</h2>
    <div>
      <details>
        <summary>À qui s’adresse Hoslink ?</summary>
        <p>
          Aux hôtels et aux prestataires professionnels en France : activités,
          bien-être, location et autres services. Chaque établissement dispose
          de sa fiche et de son équipe.
        </p>
      </details>
      <details>
        <summary>Puis-je explorer le réseau avant de m’inscrire ?</summary>
        <p>
          Vous pouvez préparer votre recherche depuis cette page. Les fiches et
          les échanges restent réservés aux comptes rattachés à un établissement
          validé.
        </p>
      </details>
      <details>
        <summary>Comment un partenariat devient-il actif ?</summary>
        <p>
          Les deux établissements acceptent les mêmes conditions et disposent
          chacun d’une place. Vous avez deux places gratuites pour commencer.
        </p>
      </details>
      <details>
        <summary>Les prestations sont-elles payées sur Hoslink ?</summary>
        <p>
          Les réservations, prestations, règlements et commissions éventuelles
          restent gérés directement entre partenaires. Hoslink centralise vos
          échanges et vos accords.
        </p>
      </details>
    </div>
  </section>
  <section class="market-closing">
    <h2>Votre prochaine belle rencontre<br />commence ici.</h2>
    <a class="button" href="/inscription"
      >Trouver mes futurs partenaires ${views["arrow"](d, p)}</a
    >
  </section>
`;
views["search-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>`;
views["pin-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>`;
views["play"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m10 8 6 4-6 4Z" />
  </svg>`;
views["shield-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
    <path d="m8 12 3 3 5-6" />
  </svg>`;
views["message-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <path d="M21 11.5a9 9 0 0 1-13.5 7.8L3 21l1.7-4.5A9 9 0 1 1 21 11.5Z" />
    <path d="M8 10h8M8 14h5" />
  </svg>`;
views["link-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <path
      d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
      transform="translate(1 1)"
    />
  </svg>`;
views["hotel-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <path
      d="M3 21V3h11v18M14 9h7v12M1 21h22M7 7h3M7 11h3M7 15h3M17 13h1M17 17h1M7 21v-3h3v3"
    />
  </svg>`;
views["service-icon"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <path
      d="M3 10h18L19 3H5Zm1 0v11h16V10M9 21v-7h6v7M2 10a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2"
    />
  </svg>`;
views["layout"] = (d, p) =>
  html`<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${d.Title} · Hoslink</title>
        <meta
          name="description"
          content="Hoslink met en relation les hôtels et les prestataires pour construire des partenariats professionnels."
        />
        <meta name="theme-color" content="#f7f7f8" />
        <link
          rel="preload"
          href="/static/fonts/AdwaitaSans-Regular.ttf"
          as="font"
          type="font/ttf"
          crossorigin
        />
        <script src="/static/app.js?v=hoslink-logo-4" defer></script>
        <script type="module" src="/static/auth.js"></script>
        <link rel="stylesheet" href="/static/app.css?v=hoslink-logo-4" />
        ${truth(d.Page === "home") ? html`<link rel="stylesheet" href="/static/landing.css?v=hoslink-logo-4" />` : html``}
      </head>
      <body
        class="${truth(d.Page === "home") ? html`landing` : html`application`}"
      >
        <a class="skip-link" href="#main">Aller au contenu</a>
        ${
          truth(d.Page === "home")
            ? html`<header class="public-header">
                <a class="wordmark" href="/" aria-label="Hoslink, accueil"
                  ><img
                    class="brand-logo"
                    src="/public/logo.png"
                    alt="Hoslink"
                    width="1446"
                    height="734"
                /></a>
                <nav aria-label="Navigation principale">
                  <a href="/presentation" aria-current="page">Accueil</a
                  ><a href="#concept">À propos</a
                  ><a href="/recherche">Prestataires</a
                  ><a href="/recherche?category=hotel">Établissements</a
                  ><a href="#fonctionnement">Ressources</a>
                </nav>
                <div class="header-actions">
                  ${truth(d.User) ? html`<a class="button account-access" href="/tableau-de-bord">Mon espace ${views["arrow"](d, p)}</a>` : html`<a class="login-link" href="/connexion">Se connecter</a><a class="button" href="/inscription">S’inscrire</a>`}
                </div>
              </header>`
            : html``
        }
        <div class="shell">
          <aside class="sidebar">
            <a
              class="brand"
              href="/presentation"
              aria-label="Hoslink, voir la page de présentation"
              ><span class="wordmark"
                ><img
                  class="brand-logo"
                  src="/public/logo.png"
                  alt="Hoslink"
                  width="1446"
                  height="734" /></span
            ></a>
            <div class="network-label">VOTRE ESPACE PROFESSIONNEL</div>
            <nav aria-label="Navigation principale">
              ${
                truth(d.User)
                  ? html`<a
                        href="/tableau-de-bord"
                        ${truth(d.Page === "dashboard") ? html`aria-current="page"` : html``}
                        ><span>Tableau de bord</span></a
                      ><a
                        href="/annuaire"
                        ${truth(d.Page === "directory") ? html`aria-current="page"` : html``}
                        ><span>Explorer le réseau</span></a
                      ><a
                        href="/partenariats"
                        ${truth(d.Page === "partnerships") ? html`aria-current="page"` : html``}
                        ><span>Mes partenariats</span></a
                      ><a
                        href="/messages"
                        ${truth(d.Page === "conversations" || d.Page === "conversation") ? html`aria-current="page"` : html``}
                        ><span>Messages & devis</span></a
                      >
                      <div class="nav-divider"></div>
                      <a
                        href="/compte"
                        ${truth(d.Page === "account") ? html`aria-current="page"` : html``}
                        ><span>Mon établissement</span></a
                      ><a
                        href="/equipe"
                        ${truth(d.Page === "team") ? html`aria-current="page"` : html``}
                        ><span>Mon équipe</span></a
                      ><a href="/securite"><span>Sécurité du compte</span></a
                      ><a
                        href="/offres"
                        ${truth(d.Page === "offers") ? html`aria-current="page"` : html``}
                        ><span>Mon offre</span></a
                      >${truth(d.User.Admin) ? html`<a href="/administration" ${truth(d.Page === "admin") ? html`aria-current="page"` : html``}><span>Administration</span></a>` : html``}`
                  : html`<a href="/connexion"><span>Se connecter</span></a
                      ><a href="/inscription"
                        ><span>Rejoindre le réseau</span></a
                      >`
              }
            </nav>
            <div class="sidebar-bottom">
              <div class="pilot">
                <span class="dot"></span> Réseau professionnel privé<small
                  >Votre réseau de partenaires.</small
                >
              </div>
              <a class="presentation-access" href="/presentation"
                >Découvrir Hoslink ${views["arrow"](d, p)}</a
              ><a class="muted" href="/informations"
                >Informations & confidentialité</a
              >${truth(d.User) ? html`<form action="/deconnexion" method="post"><input type="hidden" name="csrf" value="${d.CSRF}" /><button class="logout">Se déconnecter</button></form>` : html``}
            </div>
          </aside>
          <div class="workspace">
            <header class="topbar">
              <span
                >Hôtels & prestataires · France
                <span class="pill">PILOTE</span></span
              >${
                truth(d.User)
                  ? html`<a class="identity" href="/compte"
                      ><span class="avatar">${initial(d.User.Name)}</span
                      ><span
                        >${d.User.Name}<small
                          >${truth(d.User.EstName) ? html`${d.User.EstName}` : html`Votre espace professionnel`}</small
                        ></span
                      ></a
                    >`
                  : html`<a href="/connexion">Espace professionnel ↗</a>`
              }
            </header>
            <main id="main">
              ${truth(d.Error) ? html`<div class="notice error" role="alert">${d.Error}</div>` : html``}${truth(d.Success) ? html`<div class="notice success" role="status">${d.Success}</div>` : html``}
              ${truth(d.Page === "home") ? html`${views["home"](d, p)}` : truth(d.Page === "search") ? html`${views["search"](d, p)}` : truth(d.Page === "dashboard") ? html`${views["dashboard"](d, p)}` : truth(d.Page === "directory") ? html`${views["directory"](d, p)}` : truth(d.Page === "account") ? html`${views["account"](d, p)}` : truth(d.Page === "profile") ? html`${views["profile"](d, p)}` : truth(d.Page === "team") ? html`${views["team"](d, p)}` : truth(d.Page === "conversations") ? html`${views["conversations"](d, p)}` : truth(d.Page === "conversation") ? html`${views["conversation"](d, p)}` : truth(d.Page === "partnerships") ? html`${views["partnerships"](d, p)}` : truth(d.Page === "offers") ? html`${views["offers"](d, p)}` : truth(d.Page === "admin") ? html`${views["admin"](d, p)}` : truth(d.Page === "history") ? html`${views["history"](d, p)}` : truth(d.Page === "legal") ? html`${views["legal"](d, p)}` : html`${views["auth"](d, p)}`}
            </main>
            <footer>
              <a class="wordmark" href="/"
                ><img
                  class="brand-logo"
                  src="/public/logo.png"
                  alt="Hoslink"
                  width="1446"
                  height="734" /></a
              ><span>Les bonnes relations font la différence.</span
              ><a href="/informations">Informations & confidentialité</a>
            </footer>
          </div>
        </div>
      </body>
    </html>`;
views["csrf"] = (d, p) =>
  html`<input type="hidden" name="csrf" value="${d.CSRF}" />`;
views["categories"] = (d, p) =>
  html`<option value="hotel">Hôtel</option>
    <option value="ski">Location de skis</option>
    <option value="spa">Spa & bien-être</option>
    <option value="activite">Activités</option>
    <option value="autre">Autres services</option>`;
views["arrow"] = (d, p) =>
  html`<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    aria-hidden="true"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>`;
views["legal"] = (d, p) =>
  html`<h1>Informations du projet.</h1>
    <section class="card prose">
      <h2>Version de développement</h2>
      <p>
        Hoslink est une plateforme en développement. Le service n’est pas ouvert
        à la commercialisation. L’identité de l’exploitant, les coordonnées de
        contact, les mentions légales et les conditions contractuelles doivent
        être complétées avant ouverture.
      </p>
      <h2>Données professionnelles</h2>
      <p>
        Les comptes, coordonnées, fiches, échanges et accords servent au
        fonctionnement du réseau. Les échanges et les documents sont accessibles
        aux équipes des établissements concernés. Les administrateurs disposent
        d’outils de validation et de modération.
      </p>
      <p>
        Les bases légales, durées de conservation, coordonnées du responsable de
        traitement et procédure d’exercice des droits seront précisées avant
        toute collecte réelle dans le cadre du pilote.
      </p>
      <h2>Relations entre partenaires</h2>
      <p>
        Les prestations, leur règlement et les commissions éventuelles sont
        gérés directement entre professionnels. La plateforme conserve les
        échanges et les conditions de partenariat ; elle ne gère pas les
        réservations des voyageurs.
      </p>
    </section>`;
views["listing"] = (d, p) => html`
  <article class="listing card">
    <div class="listing-art photo-listing ${d.Category}">
      <img
        src="${views["activity-image"](d.Category, p)}"
        alt=""
        width="768"
        height="512"
        loading="lazy"
      /><span class="illustration-label">Illustration d’activité</span
      ><span class="category-label">${category(d.Category)}</span>
    </div>
    <div class="listing-content">
      <span class="verified-inline"
        >${views["shield-icon"](d, p)} Professionnel validé</span
      >
      <div class="location">
        ${d.Station}${truth(d.Station && d.City) ? html` · ` : html``}${d.City}
      </div>
      <h2><a href="/etablissements/${d.ID}">${d.Name}</a></h2>
      <p>
        ${truth(d.Description) ? html`${d.Description}` : html`Présentation à compléter. Consultez la fiche pour contacter ce professionnel.`}
      </p>
      <a class="text-link" href="/etablissements/${d.ID}"
        >Voir la fiche et échanger ${views["arrow"](d, p)}</a
      >
    </div>
  </article>
`;
views["activity-image"] = (d, p) =>
  html`${truth(d === "hotel") ? html`/static/media/hotel.webp` : truth(d === "spa") ? html`/static/media/wellness.webp` : truth(d === "activite") ? html`/static/media/activities.webp` : html`/static/media/hospitality.webp`}`;
views["offers"] = (d, p) =>
  html`<h1>Un réseau à votre mesure.</h1>
    <p>
      Votre établissement compte
      <strong>${d.Active} partenariat(s) actif(s)</strong>. Capacité actuelle :
      <strong
        >${truth(d.Unlimited) ? html`illimitée` : html`${d.Slots} partenaires`}</strong
      >.
    </p>
    <div class="three-col">
      <section class="card pricing">
        <h2>Découverte</h2>
        <div class="price">Gratuit</div>
        <p>
          Deux partenariats actifs, l’annuaire privé et les échanges avec le
          réseau.
        </p>
        <span class="badge">Inclus</span>
      </section>
      <section class="card pricing">
        <h2>Place permanente</h2>
        <div class="price">Bientôt</div>
        <p>
          Une place supplémentaire achetée une fois, réutilisable quand un
          partenariat se termine.
        </p>
        <span class="muted">Tarif en préparation</span>
      </section>
      <section class="card pricing featured">
        <h2>Abonnement</h2>
        <div class="price">Bientôt</div>
        <p>
          Des partenariats illimités pendant la durée de votre abonnement
          mensuel.
        </p>
        <span>Tarif en préparation</span>
      </section>
    </div>
    <div class="notice">
      Le pilote utilise les places gratuites. Les achats ouvriront une fois les
      tarifs et les conditions commerciales finalisés.
    </div>`;
views["partnerships"] = (d, p) =>
  html`<div class="page-heading">
      <div>
        <h1>Vos partenariats.</h1>
        <p>
          Examinez vos propositions et retrouvez les conditions de vos
          collaborations.
        </p>
      </div>
      <a class="button secondary" href="/offres">Gérer ma capacité ↗</a>
    </div>
    ${
      d.Items?.length
        ? d.Items.map(
            (row: ViewData) =>
              html`<article class="card agreement-card">
                <div class="split">
                  <div>
                    <a href="/etablissements/${row.OtherID}"
                      ><h2>${row.Name}</h2></a
                    ><small>Version ${row.Version} · ${row.Date}</small>
                  </div>
                  <span class="badge ${row.Status}"
                    >${truth(row.Status === "active") ? html`Accord actif` : truth(row.Status === "pending") ? html`${truth(row.Accepted) ? html`En attente du partenaire` : html`À examiner`}` : html`${status(row.Status)}`}</span
                  >
                </div>
                <p class="pre terms">${row.Terms}</p>
                <a class="text-link" href="/partenariats/${row.ID}/historique"
                  >Consulter les versions précédentes ↗</a
                >${truth(row.Status === "pending") ? html`<p>${truth(row.Accepted) ? html`Vous avez accepté cette version. L’activation nécessite l’accord et la capacité des deux parties.` : html`Lisez les conditions avant d’accepter cette version.`}</p>` : html``}${
                  truth(p.User.Role === "owner")
                    ? html`<div class="actions">
                          ${truth(row.Status === "pending" && !truth(row.Accepted)) ? html`<form method="post" action="/partenariats/${row.ID}/accepter">${views["csrf"](p, p)}<input type="hidden" name="version" value="${row.Version}" /><button>Accepter les conditions ${views["arrow"](d, p)}</button></form>` : html``}${truth(row.Status === "suspended" || row.Status === "ended") ? html`<form method="post" action="/partenariats/${row.ID}/reactiver">${views["csrf"](p, p)}<input type="hidden" name="version" value="${row.Version}" /><button>Proposer une réactivation</button></form>` : html``}${truth(row.Status !== "ended") ? html`<form method="post" action="/partenariats/${row.ID}/terminer" data-confirm="Cette action clôture la relation dans Hoslink. Les engagements externes restent applicables. Continuer ?">${views["csrf"](p, p)}<input type="hidden" name="version" value="${row.Version}" /><button class="secondary danger">${truth(row.Status === "pending") ? html`${truth(row.Accepted) ? html`Retirer la proposition` : html`Décliner la proposition`}` : html`Terminer dans la plateforme`}</button></form>` : html``}${
                            truth(row.Status === "active")
                              ? html`<form
                                    method="post"
                                    action="/partenariats/${row.ID}/conserver"
                                  >
                                    ${views["csrf"](p, p)}<input
                                      type="hidden"
                                      name="version"
                                      value="${row.Version}"
                                    /><button class="secondary">
                                      Prioriser après abonnement
                                    </button>
                                  </form>
                                  <form
                                    method="post"
                                    action="/partenariats/${row.ID}/deprioriser"
                                  >
                                    ${views["csrf"](p, p)}<input
                                      type="hidden"
                                      name="version"
                                      value="${row.Version}"
                                    /><button class="secondary">
                                      Retirer la priorité
                                    </button>
                                  </form>`
                              : html``
                          }
                        </div>
                        <details>
                          <summary>Proposer de nouvelles conditions</summary>
                          <form
                            method="post"
                            action="/partenariats/${row.ID}/modifier"
                          >
                            ${views["csrf"](p, p)}<input
                              type="hidden"
                              name="version"
                              value="${row.Version}"
                            /><label
                              >Nouvelles conditions<textarea
                                name="terms"
                                required
                                maxlength="10000"
                                rows="5"
                              >
${row.Terms}</textarea>
                            </label>
                            <p>
                              La nouvelle version devra être acceptée de
                              nouveau. Le partenariat repassera en attente.
                            </p>
                            <button>Proposer cette version</button>
                          </form>
                        </details>`
                    : html``
                }
              </article>`,
          )
        : html`<div class="empty card">
            <h2>Chaque partenariat commence par une rencontre.</h2>
            <p>Explorez l’annuaire et proposez votre premier accord.</p>
            <a class="button" href="/annuaire">Trouver un partenaire ↗</a>
          </div>`
    }
    <p class="muted">
      Suspendre ou terminer une relation dans la plateforme ne résilie pas
      automatiquement les engagements conclus entre les professionnels.
    </p>`;
views["profile"] = (d, p) =>
  html`<a class="back" href="/annuaire">← Retour au réseau</a>
    <div class="profile-photo">
      <img
        src="${views["activity-image"](d.Item.Category, p)}"
        width="768"
        height="512"
        alt="Illustration de la catégorie d’activité de cet établissement"
      /><span>Visuel d’illustration de l’activité</span>
    </div>
    <div class="profile-cover ${d.Item.Category}">
      <div>
        <span class="badge">Professionnel validé</span>
        <h1>${d.Item.Name}</h1>
        <p>
          ${category(d.Item.Category)} ·
          ${d.Item.Station}${truth(d.Item.City) ? html` · ${d.Item.City}` : html``}
        </p>
        ${truth(d.User.EstID !== d.Item.ID) ? html`<div class="actions">${truth(d.User.Role === "owner") ? html`<a class="button" href="#proposition">Proposer un partenariat ${views["arrow"](d, p)}</a>` : html``}<a class="button secondary" href="#contact">Contacter l’équipe</a></div>` : html``}
      </div>
    </div>
    <div class="two-col">
      <section class="card">
        <h2>À propos de l’établissement</h2>
        <p class="pre">
          ${truth(d.Item.Description) ? html`${d.Item.Description}` : html`Cet établissement n’a pas encore renseigné sa présentation. Contactez son équipe pour découvrir ses services.`}
        </p>
        <p>${d.Item.Body}</p>
        <small>SIRET ${d.Item.Subject}</small>${
          truth(d.User.EstID !== d.Item.ID)
            ? html`<details>
                <summary>Signaler un problème</summary>
                <form method="post" action="/signalements">
                  ${views["csrf"](d, p)}<input
                    type="hidden"
                    name="other"
                    value="${d.Item.ID}"
                  /><label
                    >Motif<textarea
                      name="note"
                      required
                      maxlength="1000"
                    ></textarea></label
                  ><button class="secondary">Transmettre le signalement</button>
                </form>
              </details>`
            : html``
        }${
          truth(d.User.EstID === d.Item.ID && d.User.Role === "owner")
            ? html`<form method="post" action="/fiche">
                ${views["csrf"](d, p)}<label
                  >Modifier la présentation<textarea
                    name="description"
                    maxlength="3000"
                    rows="5"
                  >
${d.Item.Description}</textarea></label
                ><button>Enregistrer</button>
              </form>`
            : html``
        }
      </section>
      ${
        truth(d.User.EstID !== d.Item.ID)
          ? html`<section id="contact" class="card">
              <h2>Contacter ce professionnel</h2>
              <p>Présentez votre projet ou demandez un devis à son équipe.</p>
              <form method="post" action="/messages">
                ${views["csrf"](d, p)}<input
                  type="hidden"
                  name="other"
                  value="${d.Item.ID}"
                /><label
                  >Objet<input
                    name="subject"
                    required
                    maxlength="160"
                    placeholder="Un projet de recommandation réciproque…" /></label
                ><label
                  >Votre message<textarea
                    name="body"
                    required
                    maxlength="10000"
                    rows="5"
                  ></textarea></label
                ><label class="check"
                  ><input type="checkbox" name="quote" value="1" /> Il s’agit
                  d’une demande de devis</label
                ><button>Envoyer mon message ↗</button>
              </form>
            </section>`
          : html``
      }
    </div>
    ${
      truth(d.User.EstID !== d.Item.ID && d.User.Role === "owner")
        ? html`<section id="proposition" class="card proposal-card">
            <h2>Proposer un partenariat</h2>
            <p>
              Précisez les avantages clients, les éventuelles commissions, la
              période et les conditions convenues. Votre partenaire devra
              accepter ces conditions.
            </p>
            <form method="post" action="/partenariats">
              ${views["csrf"](d, p)}<input
                type="hidden"
                name="other"
                value="${d.Item.ID}"
              /><label
                >Conditions de l’accord<textarea
                  name="terms"
                  required
                  maxlength="10000"
                  rows="5"
                  placeholder="Décrivez les avantages, les engagements et la durée du partenariat…"
                  aria-describedby="agreement-help"
                ></textarea></label
              ><small id="agreement-help"
                >L’accord sera actif après acceptation des deux établissements
                et vérification de leurs places disponibles.</small
              ><button>Proposer cet accord ↗</button>
            </form>
          </section>`
        : html``
    }`;
views["search"] = (d, p) =>
  html`<div class="auth-wrap">
    <a class="back" href="/presentation">Retour à l’accueil</a>
    <h1>Votre prochain partenaire se trouve dans le réseau.</h1>
    <div class="card auth-card">
      <h2>Votre recherche est prête.</h2>
      ${
        truth(d.Query || d.Category || d.Station)
          ? html`<dl class="search-summary">
              ${
                truth(d.Query)
                  ? html`<dt>Recherche</dt>
                      <dd>${d.Query}</dd>`
                  : html``
              }${
                truth(d.Category)
                  ? html`<dt>Activité</dt>
                      <dd>${category(d.Category)}</dd>`
                  : html``
              }${
                truth(d.Station)
                  ? html`<dt>Destination</dt>
                      <dd>${d.Station}</dd>`
                  : html``
              }
            </dl>`
          : html``
      }
      <p>
        L’annuaire est réservé aux professionnels validés. Connectez-vous pour
        consulter les établissements et contacter leurs équipes.
      </p>
      ${
        truth(d.User)
          ? html`<a class="button" href="/compte"
              >Vérifier mon établissement ${views["arrow"](d, p)}</a
            >`
          : html`<a class="button" href="/connexion"
                >Me connecter et voir le réseau ${views["arrow"](d, p)}</a
              >
              <p>
                Vous découvrez Hoslink ?
                <a href="/inscription">Créer mon compte professionnel</a>
              </p>`
      }<small
        >Votre recherche est conservée pendant 30 minutes pour votre
        connexion.</small
      >
    </div>
  </div>`;
views["team"] = (d, p) =>
  html`<h1>Votre équipe.</h1>
    <div class="card">
      ${
        d.Members?.length
          ? d.Members.map(
              (row: ViewData) =>
                html`<div class="member">
                  <div>
                    <strong>${row.Name}</strong
                    ><small>${row.Description}</small>
                  </div>
                  <span class="badge"
                    >${truth(row.Role === "owner") ? html`Responsable` : html`Collaborateur`}</span
                  >${truth(p.User.Role === "owner" && row.Role === "member") ? html`<form action="/equipe/${row.ID}/retirer" data-confirm="Retirer ce membre de l’équipe ? Il perdra son accès à cet établissement." method="post">${views["csrf"](p, p)}<button class="secondary">Retirer</button></form>` : html``}
                </div>`,
            )
          : html``
      }
    </div>
    ${
      truth(d.User.Role === "owner")
        ? html`<section class="card">
            <h2>Inviter un collaborateur</h2>
            <p>
              Il pourra consulter le réseau et échanger avec vos partenaires.
              Les accords et la facturation restent sous votre responsabilité.
            </p>
            <form method="post" action="/equipe/inviter" class="inline-form">
              ${views["csrf"](d, p)}<label
                >Email professionnel<input
                  type="email"
                  name="email"
                  required /></label
              ><button>Envoyer l’invitation ↗</button>
            </form>
          </section>`
        : html``
    }`;
export function Layout({ page }: { page: ViewData }) {
  if (page.Page === "home") return <>{views.layout(page, page)}</>;
  const content = (views[page.Page] || views.auth)(page, page);
  if (!page.User)
    return <AccessLayout title={page.Title}>{content}</AccessLayout>;
  return (
    <Workspace
      title={page.Title}
      current={page.Page}
      user={page.User}
      csrf={page.CSRF}
    >
      {content}
    </Workspace>
  );
}
export function renderPage(data: ViewData) {
  const page = {
    Title: "Hoslink",
    Page: "home",
    Items: [],
    Messages: [],
    Members: [],
    Establishments: [],
    Item: {},
    Slots: 0,
    Active: 0,
    Pending: 0,
    ...data,
  };
  return <Layout page={page} />;
}
