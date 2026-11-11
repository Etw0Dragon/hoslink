// Native forms remain fully functional without JavaScript.
document.addEventListener("submit", (event) => {
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
