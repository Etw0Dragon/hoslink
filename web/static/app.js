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

// Prévisualisation locale des photos avant enregistrement.
document.querySelectorAll('[data-photo-picker]').forEach((input) => {
  let previewUrl;
  input.addEventListener('change', () => {
    const key = input.dataset.photoPicker;
    const name = document.querySelector(`[data-upload-name="${key}"]`);
    const preview = document.querySelector(`[data-upload-preview="${key}"]`);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = input.files?.[0];
    if (name) name.textContent = file ? file.name : 'Aucune nouvelle photo sélectionnée';
    input.setCustomValidity('');
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      input.setCustomValidity('Choisissez une image JPEG ou PNG de 4 Mo maximum.');
      input.reportValidity();
      if (name) name.textContent = 'Image JPEG ou PNG de 4 Mo maximum attendue.';
      return;
    }
    if (preview) {
      const img = document.createElement('img');
      previewUrl = URL.createObjectURL(file);
      img.src = previewUrl;
      img.alt = 'Aperçu de la photo sélectionnée';
      preview.replaceChildren(img);
    }
  });
});
