import type { Child } from "hono/jsx";
import type { Identity } from "../types.js";
const paths = {
  dashboard: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  directory: "M21 21l-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  partnerships:
    "m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  messages: "M21 11a9 9 0 0 1-13 8l-5 2 2-5A9 9 0 1 1 21 11ZM8 10h8M8 14h5",
  account: "M4 21V3h12v18M16 9h5v12M2 21h21M8 7h4M8 11h4M8 15h4M8 21v-3h4v3",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  security: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  offers: "M3 7h18v14H3ZM1 3h22v4H1Zm11 0v18",
  admin:
    "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  logout: "M9 3H3v18h6m6-15 6 6-6 6m-8-6h14",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <a
      class="workspace-brand"
      href="/presentation"
      aria-label="Hoslink, accueil"
    >
      <img src="/public/logo.png" width="1446" height="734" alt="Hoslink" />
    </a>
  );
}
const navigation = [
  ["dashboard", "/tableau-de-bord", "Tableau de bord"],
  ["directory", "/annuaire", "Explorer le réseau"],
  ["partnerships", "/partenariats", "Partenariats"],
  ["messages", "/messages", "Messages & devis"],
  ["account", "/compte", "Mon établissement"],
  ["team", "/equipe", "Mon équipe"],
  ["security", "/securite", "Sécurité du compte"],
  ["offers", "/offres", "Mon offre"],
] as const;
function Head({ title }: { title: string }) {
  return (
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="theme-color" content="#0c2635" />
      <title>{title} · Hoslink</title>
      <link
        rel="preload"
        href="/static/fonts/AdwaitaSans-Regular.ttf"
        as="font"
        type="font/ttf"
        crossorigin="anonymous"
      />
      <link rel="stylesheet" href="/static/app.css?v=workspace-2" />
      <link rel="stylesheet" href="/static/workspace.css?v=workspace-2" />
      <script src="/static/app.js?v=workspace-2" defer />
      <script type="module" src="/static/auth.js?v=workspace-2" />
    </head>
  );
}
export function Workspace({
  title,
  current,
  user,
  csrf,
  children,
}: {
  title: string;
  current: string;
  user: Identity;
  csrf: string;
  children: Child;
}) {
  const active =
    current === "conversations" || current === "conversation"
      ? "messages"
      : current;
  return (
    <html lang="fr">
      <Head title={title} />
      <body class="application enterprise">
        <a class="skip-link" href="#main">
          Aller au contenu
        </a>
        <div class="shell">
          <aside class="sidebar">
            <Brand />
            <div class="establishment-context">
              <Icon name="account" />
              <span>
                {user.EstName || "Votre espace Hoslink"}
                <small>
                  {user.Admin
                    ? "Administration & réseau"
                    : user.Role === "owner"
                      ? "Responsable d’établissement"
                      : "Espace professionnel"}
                </small>
              </span>
            </div>
            <nav aria-label="Navigation principale">
              {navigation.map(([key, href, label]) => (
                <a
                  href={href}
                  aria-current={active === key ? "page" : undefined}
                >
                  <Icon name={key} />
                  <span>{label}</span>
                </a>
              ))}
              {user.Admin && (
                <a
                  href="/administration"
                  aria-current={current === "admin" ? "page" : undefined}
                >
                  <Icon name="admin" />
                  <span>Administration</span>
                </a>
              )}
            </nav>
            <div class="sidebar-bottom">
              <a class="presentation-access" href="/presentation">
                Découvrir Hoslink
                <Icon name="arrow" />
              </a>
              <form method="post" action="/deconnexion">
                <input type="hidden" name="csrf" value={csrf} />
                <button class="logout">
                  <Icon name="logout" />
                  Se déconnecter
                </button>
              </form>
            </div>
          </aside>
          <div class="workspace">
            <header class="topbar">
              <a href={user.Admin ? "/administration" : "/tableau-de-bord"}>
                {user.Admin
                  ? "Administration Hoslink"
                  : "Mon espace professionnel"}
              </a>
              <a class="identity" href="/securite">
                <span class="avatar">{[...(user.Name || "?")][0]}</span>
                <span>
                  {user.Name}
                  <small>
                    {user.Admin
                      ? "Administrateur"
                      : user.EstName || "Mon compte"}
                  </small>
                </span>
              </a>
              <form class="mobile-logout" method="post" action="/deconnexion">
                <input type="hidden" name="csrf" value={csrf} />
                <button aria-label="Se déconnecter" title="Se déconnecter">
                  <Icon name="logout" />
                </button>
              </form>
            </header>
            <main id="main" class={`workspace-page page-${current}`}>
              <div id="auth-status" role="status" aria-live="polite" />
              {children}
            </main>
            <footer>
              <span>Hoslink · Les bonnes relations font la différence.</span>
              <a href="/informations">Informations & confidentialité</a>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
export function AccessLayout({
  title,
  children,
}: {
  title: string;
  children: Child;
}) {
  return (
    <html lang="fr">
      <Head title={title} />
      <body class="application access-page">
        <a class="skip-link" href="#main">
          Aller au contenu
        </a>
        <div class="access-shell">
          <aside class="access-story">
            <Brand />
            <div class="access-story-copy">
              <h2>
                Les bonnes relations
                <br />
                commencent ici.
              </h2>
              <p>
                Hôtels, activités, bien-être : retrouvez les professionnels qui
                complètent votre métier.
              </p>
            </div>
            <figure>
              <img
                src="/static/media/hotel.webp"
                alt=""
                width="800"
                height="1000"
              />
              <figcaption>Illustration d’activité</figcaption>
            </figure>
            <a href="/presentation" class="access-back">
              Découvrir Hoslink
              <Icon name="arrow" />
            </a>
          </aside>
          <main id="main">
            <a class="back" href="/presentation">
              Retour à l’accueil
            </a>
            <div id="auth-status" role="status" aria-live="polite" />
            {children}
            <p class="access-privacy">
              <Icon name="security" />
              Vos échanges restent dans votre réseau professionnel.
            </p>
          </main>
        </div>
      </body>
    </html>
  );
}
