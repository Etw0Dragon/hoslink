import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";
import QRCode from "qrcode";
const client = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        location.assign("/double-authentification");
      },
    }),
  ],
});
const status =
  document.getElementById("auth-status") ||
  Object.assign(document.createElement("p"), {
    id: "auth-status",
    role: "status",
  });
if (!status.parentNode) document.querySelector("main")?.prepend(status);
const actions: Record<string, string> = {
  "/connexion": "login",
  "/inscription": "signup",
  "/mot-de-passe": "forgot",
  "/reinitialiser": "reset",
  "/verifier": "verify",
  "/deconnexion": "logout",
  "/renvoyer-verification": "resend",
};
for (const form of document.querySelectorAll<HTMLFormElement>("form")) {
  const action =
    form.dataset.auth || actions[new URL(form.action, location.href).pathname];
  if (!action) continue;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form)) as Record<
        string,
        string
      >,
      button = form.querySelector("button");
    if (button) button.disabled = true;
    try {
      let result: any;
      const next = "/apres-connexion";
      switch (action) {
        case "login":
          result = await client.signIn.email({
            email: data.email,
            password: data.password,
          });
          if (!result.error && !result.data?.twoFactorRedirect)
            location.assign(next);
          break;
        case "signup":
          result = await client.signUp.email({
            name: data.name,
            email: data.email,
            password: data.password,
            callbackURL: "/connexion",
          });
          if (!result.error)
            status.textContent =
              "Compte créé. Consultez votre email pour confirmer votre adresse.";
          break;
        case "forgot":
          result = await client.requestPasswordReset({
            email: data.email,
            redirectTo: "/reinitialiser",
          });
          if (!result.error)
            status.textContent =
              "Si ce compte existe, un lien de réinitialisation a été envoyé.";
          break;
        case "reset":
          result = await client.resetPassword({
            newPassword: data.password,
            token: data.token,
          });
          if (!result.error) location.assign("/connexion");
          break;
        case "verify":
          result = await client.verifyEmail({ query: { token: data.token } });
          if (!result.error) location.assign("/connexion");
          break;
        case "resend": {
          const s = await client.getSession();
          if (s.data)
            result = await client.sendVerificationEmail({
              email: s.data.user.email,
              callbackURL: "/connexion",
            });
          if (!result?.error) status.textContent = "Consultez votre email.";
          break;
        }
        case "logout":
          result = await client.signOut();
          if (!result.error) location.assign("/connexion");
          break;
        case "enable":
          result = await client.twoFactor.enable({ password: data.password });
          if (!result.error && result.data) {
            await QRCode.toCanvas(
              document.getElementById("totp-qr") as HTMLCanvasElement,
              result.data.totpURI,
            );
            document.getElementById("backup-codes")!.textContent =
              result.data.backupCodes.join("\n");
            document.getElementById("enrollment")!.hidden = false;
            status.textContent =
              "Scannez le QR code puis confirmez avec un code Authenticator.";
          }
          break;
        case "verify-enrollment":
        case "totp":
          result = await client.twoFactor.verifyTotp({ code: data.code });
          if (!result.error)
            location.assign(action === "totp" ? next : "/securite");
          break;
        case "backup":
          result = await client.twoFactor.verifyBackupCode({ code: data.code });
          if (!result.error) location.assign(next);
          break;
        case "disable":
          result = await client.twoFactor.disable({ password: data.password });
          if (!result.error) location.reload();
          break;
        case "revoke":
          result = await client.revokeSessions();
          if (!result.error) location.assign("/connexion");
          break;
      }
      if (result?.error)
        status.textContent =
          result.error.message || "La demande a échoué. Réessayez.";
    } catch {
      status.textContent = "La demande a échoué. Réessayez.";
    } finally {
      if (button) button.disabled = false;
      delete form.dataset.submitting;
      form.removeAttribute("aria-busy");
    }
  });
}
