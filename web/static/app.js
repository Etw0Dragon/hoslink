// Business forms use native submission; authentication is handled by Better Auth.
document.addEventListener("submit", (event) => {
  if (event.defaultPrevented) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.method !== "post") return;
  if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
    event.preventDefault();
    return;
  }
  if (form.dataset.submitting) {
    event.preventDefault();
    return;
  }
  form.dataset.submitting = "true";
  const button = event.submitter;
  if (button instanceof HTMLButtonElement) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = "Envoi en cours…";
  }
  form.setAttribute("aria-busy", "true");
});
window.addEventListener("pageshow", () => {
  document.querySelectorAll("form[data-submitting]").forEach((form) => {
    delete form.dataset.submitting;
    form.removeAttribute("aria-busy");
    form.querySelectorAll("button[data-original-label]").forEach((button) => {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
      button.disabled = false;
    });
  });
});

// Keep the current destination visible in the horizontal mobile navigation.
if (window.matchMedia("(max-width: 760px)").matches) {
  const nav = document.querySelector(".enterprise .sidebar nav");
  const active = nav?.querySelector('[aria-current="page"]');
  if (nav && active)
    nav.scrollLeft = Math.max(0, active.offsetLeft - nav.offsetLeft - 20);
}
