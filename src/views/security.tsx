import { Workspace, AccessLayout, Icon } from "./workspace.js";
import type { Identity } from "../types.js";
export function Security({
  enabled,
  admin,
  csrf,
  user,
  forgotten = false,
}: {
  enabled: boolean;
  admin: boolean;
  csrf: string;
  user: Identity;
  forgotten?: boolean;
}) {
  return (
    <Workspace
      title="Sécurité du compte"
      current="security"
      user={user}
      csrf={csrf}
    >
      <div class="page-heading">
        <div>
          <h1>Sécurité du compte</h1>
          <p>Votre compte, vos connexions. Gardez le contrôle.</p>
        </div>
        <a
          class="button"
          href={
            admin
              ? "/administration"
              : user.Status === "approved"
                ? "/tableau-de-bord"
                : "/compte"
          }
        >
          {admin ? "Accéder à l’administration" : "Retour à mon espace"}
          <Icon name="arrow" />
        </a>
      </div>
      {forgotten && (
        <div class="notice success" role="status">
          Les appareils mémorisés ont été révoqués. Un code sera demandé à leur
          prochaine connexion.
        </div>
      )}
      <div class="security-layout">
        <div class="security-settings">
          <section class="security-section">
            <div class="section-heading">
              <div>
                <h2>Double authentification</h2>
                <p>
                  {admin
                    ? "Obligatoire pour votre accès administrateur."
                    : "Un code Authenticator complète votre mot de passe."}
                </p>
              </div>
              <span class={`badge ${enabled ? "active" : "pending"}`}>
                {enabled ? "Activée" : "À configurer"}
              </span>
            </div>
            {!enabled ? (
              <>
                <form data-auth="enable">
                  <label>
                    Votre mot de passe
                    <input
                      type="password"
                      name="password"
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <button>
                    Configurer Authenticator
                    <Icon name="arrow" />
                  </button>
                </form>
                <div id="enrollment" hidden>
                  <div class="enrollment-grid">
                    <canvas
                      id="totp-qr"
                      aria-label="QR code à scanner avec Authenticator"
                    />
                    <div>
                      <h3>Scannez, puis confirmez</h3>
                      <p>
                        Ajoutez Hoslink à votre application Authenticator en
                        scannant ce QR code.
                      </p>
                    </div>
                  </div>
                  <h3>Vos codes de secours</h3>
                  <p>
                    Conservez-les dans un endroit sûr. Chaque code est
                    utilisable une seule fois.
                  </p>
                  <pre id="backup-codes" />
                  <form data-auth="verify-enrollment">
                    <label>
                      Code Authenticator
                      <input
                        class="otp-input"
                        name="code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        autoComplete="one-time-code"
                      />
                    </label>
                    <button>Confirmer l’activation</button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p class="security-confirmation">
                  <Icon name="security" />
                  Votre compte est protégé par Authenticator.
                </p>
                <details class="security-disclosure">
                  <summary>Désactiver la double authentification</summary>
                  <p>
                    {admin
                      ? "Votre accès administrateur sera bloqué jusqu’à sa réactivation."
                      : "Votre mot de passe est nécessaire pour confirmer cette action."}
                  </p>
                  <form data-auth="disable">
                    <label>
                      Votre mot de passe
                      <input
                        type="password"
                        name="password"
                        required
                        autoComplete="current-password"
                      />
                    </label>
                    <button class="secondary danger">
                      Confirmer la désactivation
                    </button>
                  </form>
                </details>
              </>
            )}
          </section>
          <section class="security-section">
            <div class="section-heading">
              <div>
                <h2>Appareils de confiance</h2>
                <p>
                  Moins de codes à saisir, sur les appareils qui vous
                  appartiennent.
                </p>
              </div>
              <Icon name="security" />
            </div>
            <p>
              À votre prochaine connexion avec Authenticator, choisissez « Faire
              confiance à cet appareil ». Votre navigateur sera mémorisé pendant
              30 jours après votre dernière connexion.
            </p>
            <form
              action="/securite/appareils/revoquer"
              method="post"
              data-confirm="Un code sera redemandé à la prochaine connexion sur vos appareils. Continuer ?"
            >
              <input type="hidden" name="csrf" value={csrf} />
              <button class="secondary">
                Révoquer les appareils mémorisés
              </button>
            </form>
          </section>
          <section class="security-section">
            <h2>Sessions de connexion</h2>
            <p>
              Fermez toutes vos sessions si vous avez laissé votre compte ouvert
              sur un autre appareil.
            </p>
            <form data-auth="revoke">
              <button class="secondary">Révoquer toutes mes sessions</button>
            </form>
          </section>
        </div>
        <aside class="security-aside">
          <Icon name="security" />
          <h2>
            Votre réseau mérite
            <br />
            un accès protégé.
          </h2>
          <p>
            Sur votre appareil personnel, mémorisez ce navigateur pour retrouver
            votre espace plus simplement.
          </p>
          <p>
            Sur un ordinateur partagé, laissez cette option décochée et
            déconnectez-vous après utilisation.
          </p>
          <a href="/informations">
            Informations & confidentialité
            <Icon name="arrow" />
          </a>
        </aside>
      </div>
    </Workspace>
  );
}
function TrustDevice() {
  return (
    <label class="trust-choice">
      <input type="checkbox" name="trustDevice" value="true" checked />
      <span>
        Faire confiance à cet appareil pendant 30 jours
        <small>À utiliser uniquement sur votre appareil personnel.</small>
      </span>
    </label>
  );
}
export function Challenge() {
  return (
    <AccessLayout title="Confirmer votre connexion">
      <div class="challenge-heading">
        <Icon name="security" />
        <h1>
          Confirmer votre
          <br />
          connexion.
        </h1>
        <p>
          Saisissez le code à six chiffres de votre application Authenticator.
        </p>
      </div>
      <form data-auth="totp">
        <label>
          Code Authenticator
          <input
            class="otp-input"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            autofocus
          />
        </label>
        <TrustDevice />
        <button>
          Accéder à mon espace
          <Icon name="arrow" />
        </button>
      </form>
      <details class="backup-disclosure">
        <summary>Utiliser un code de secours</summary>
        <p>Chaque code est utilisable une seule fois.</p>
        <form data-auth="backup">
          <label>
            Code de secours
            <input name="code" required autoComplete="off" />
          </label>
          <TrustDevice />
          <button class="secondary">Vérifier le code de secours</button>
        </form>
      </details>
      <a class="back" href="/connexion">
        Revenir à la connexion
      </a>
    </AccessLayout>
  );
}
