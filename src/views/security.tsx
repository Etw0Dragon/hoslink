function Shell({ children }: { children: any }) {
  return (
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sécurité du compte · Hoslink</title>
        <link rel="stylesheet" href="/static/app.css" />
        <script type="module" src="/static/auth.js" />
      </head>
      <body>
        <main id="main" class="auth-wrap">
          <a href="/compte">Mon établissement</a>
          <h1>Sécurité du compte</h1>
          <div id="auth-status" role="status" aria-live="polite" />
          {children}
        </main>
      </body>
    </html>
  );
}
export function Security({
  enabled,
  admin,
  csrf,
}: {
  enabled: boolean;
  admin: boolean;
  csrf: string;
}) {
  return (
    <Shell>
      <p>
        {admin
          ? "La double authentification est obligatoire pour accéder à votre espace administrateur."
          : "Protégez votre compte avec une application Authenticator."}
      </p>
      <p>Double authentification : {enabled ? "activée" : "à configurer"}</p>
      {!enabled ? (
        <>
          <form data-auth="enable">
            <label>
              Mot de passe
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button>Configurer Authenticator</button>
          </form>
          <div id="enrollment" hidden>
            <canvas id="totp-qr" aria-label="QR code Authenticator" />
            <p>
              Conservez vos codes de secours dans un endroit sûr. Chaque code
              est utilisable une seule fois.
            </p>
            <pre id="backup-codes" />
          </div>
          <form data-auth="verify-enrollment">
            <label>
              Code Authenticator
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                autoComplete="one-time-code"
              />
            </label>
            <button>Confirmer l’activation</button>
          </form>
        </>
      ) : (
        <form data-auth="disable">
          <label>
            Mot de passe
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button>Désactiver la double authentification</button>
        </form>
      )}
      <form data-auth="revoke">
        <button>Révoquer toutes mes sessions</button>
      </form>
      <form data-auth="logout">
        <input type="hidden" name="csrf" value={csrf} />
        <button>Se déconnecter</button>
      </form>
    </Shell>
  );
}
export function Challenge() {
  return (
    <Shell>
      <p>
        Saisissez le code de votre application Authenticator pour terminer la
        connexion.
      </p>
      <form data-auth="totp">
        <label>
          Code Authenticator
          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
            autoComplete="one-time-code"
          />
        </label>
        <button>Vérifier</button>
      </form>
      <details>
        <summary>Utiliser un code de secours</summary>
        <form data-auth="backup">
          <label>
            Code de secours
            <input name="code" required autoComplete="off" />
          </label>
          <button>Vérifier le code de secours</button>
        </form>
      </details>
    </Shell>
  );
}
