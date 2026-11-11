// Package preview produces a public, read-only preview without database access.
package preview

import (
	"bytes"
	"fmt"
	"html/template"
	"io/fs"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"plateforme-partenaires/public"
	"plateforme-partenaires/web"
)

type route struct {
	URL, Page, Title string
	Private          bool
}

var routes = []route{
	{"/", "home", "Accueil", false},
	{"/presentation/", "home", "Présentation", false},
	{"/connexion/", "connexion", "Connexion", false},
	{"/inscription/", "inscription", "Inscription", false},
	{"/mot-de-passe/", "mot-de-passe", "Retrouver mon accès", false},
	{"/recherche/", "search", "Recherche", false},
	{"/informations/", "legal", "Informations", false},
	{"/tableau-de-bord/", "dashboard", "Tableau de bord", true},
	{"/annuaire/", "directory", "Annuaire", true},
	{"/partenariats/", "partnerships", "Partenariats", true},
	{"/messages/", "conversations", "Messages", true},
	{"/compte/", "account", "Établissement", true},
	{"/equipe/", "team", "Équipe", true},
	{"/offres/", "offers", "Offres", true},
}

var attributes = regexp.MustCompile(`\b(href|src|action|poster)="(/[^"\s]*)"`)
var forms = regexp.MustCompile(`(?s)<form\b([^>]*)>(.*?)</form>`)
var tokens = regexp.MustCompile(`<input[^>]*name="(?:csrf|token)"[^>]*>`)

// BasePath accepts GitHub project paths and custom-domain root paths only.
func BasePath(value string) (string, error) {
	if value == "" || value == "/" {
		return "", nil
	}
	if !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || strings.ContainsAny(value, `?#\"'<>`) {
		return "", fmt.Errorf("invalid base path %q", value)
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == "." || segment == ".." || !regexp.MustCompile(`^[A-Za-z0-9_-]*$`).MatchString(segment) {
			return "", fmt.Errorf("invalid base path %q", value)
		}
	}
	return strings.TrimRight(value, "/"), nil
}

// Build refuses an existing destination: never erase a repository or stale export.
func Build(destination, base string) error {
	base, err := BasePath(base)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(destination); err == nil {
		return fmt.Errorf("destination already exists: %s", destination)
	} else if !os.IsNotExist(err) {
		return err
	}
	templates, err := web.Templates()
	if err != nil {
		return err
	}
	// This route intentionally replaces the server's login gate, which is not functional on Pages.
	_, err = templates.Parse(`{{define "search"}}<div class="auth-wrap"><h1>Explorez l’interface Hoslink.</h1><div class="card auth-card"><p>Cet aperçu statique ne recherche aucun établissement. L’annuaire réel sera réservé aux professionnels validés dans l’application complète.</p><a class="button" href="/annuaire">Voir la présentation de l’annuaire</a></div></div>{{end}}`)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(destination, 0755); err != nil {
		return err
	}
	for _, r := range routes {
		data := map[string]any{"Title": r.Title, "Page": r.Page, "Slots": 2, "Active": 0, "Pending": 0, "Items": []any{}, "Messages": []any{}, "Members": []any{}, "Establishments": []any{}}
		if r.Private {
			data["User"] = map[string]any{"Name": "Aperçu", "EstName": "Aucun établissement connecté", "Verified": true, "EstID": 0, "Role": "owner", "Status": "pending", "Admin": false}
		}
		var rendered bytes.Buffer
		if err := templates.ExecuteTemplate(&rendered, "layout", data); err != nil {
			return fmt.Errorf("render %s: %w", r.URL, err)
		}
		html := tokens.ReplaceAllString(rendered.String(), "")
		// Disable all submission without relying on JavaScript. No form can send personal data.
		html = forms.ReplaceAllString(html, `<div class="preview-form"><fieldset disabled aria-label="Formulaire désactivé dans l’aperçu">$2</fieldset><p class="preview-form-note">Aperçu uniquement : aucune donnée ne peut être envoyée.</p></div>`)
		banner := `<aside class="preview-banner" aria-label="Version de démonstration"><strong>Aperçu Hoslink</strong><span>Version statique · aucun compte connecté · aucune donnée enregistrée</span><a href="/">Accueil</a><a href="/tableau-de-bord/">Explorer l’interface</a></aside>`
		html = strings.Replace(html, `<a class="skip-link"`, banner+`<a class="skip-link"`, 1)
		html = strings.Replace(html, "</head>", `<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/static/preview.css"></head>`, 1)
		html = attributes.ReplaceAllStringFunc(html, func(match string) string {
			parts := attributes.FindStringSubmatch(match)
			u, err := url.Parse(parts[2])
			if err != nil {
				return match
			}
			// Pages serves directories, unlike the server's extensionless routes.
			if !strings.HasPrefix(u.Path, "/static/") && !strings.HasPrefix(u.Path, "/public/") && u.Path != "/" {
				u.Path = strings.TrimRight(u.Path, "/") + "/"
			}
			u.Path = base + u.Path
			return parts[1] + `="` + u.String() + `"`
		})
		output := filepath.Join(destination, filepath.FromSlash(strings.TrimPrefix(r.URL, "/")), "index.html")
		if err := write(output, []byte(html)); err != nil {
			return err
		}
	}
	if err := copyAssets(destination, "static", web.Static()); err != nil {
		return err
	}
	if err := copyAssets(destination, "public", public.Files); err != nil {
		return err
	}
	if err := write(filepath.Join(destination, ".nojekyll"), nil); err != nil {
		return err
	}
	notFound := fmt.Sprintf(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable · Hoslink</title><h1>Cette page n’est pas disponible dans l’aperçu.</h1><a href="%s/">Retour à l’accueil</a></html>`, template.HTMLEscapeString(base))
	return write(filepath.Join(destination, "404.html"), []byte(notFound))
}

func write(name string, content []byte) error {
	if err := os.MkdirAll(filepath.Dir(name), 0755); err != nil {
		return err
	}
	return os.WriteFile(name, content, 0644)
}
func copyAssets(destination, prefix string, source fs.FS) error {
	allowed := map[string]bool{".css": true, ".js": true, ".ttf": true, ".webp": true, ".png": true, ".mp4": true, ".vtt": true}
	return fs.WalkDir(source, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if !allowed[path.Ext(name)] {
			return nil
		}
		content, err := fs.ReadFile(source, name)
		if err != nil {
			return err
		}
		return write(filepath.Join(destination, prefix, filepath.FromSlash(name)), content)
	})
}
