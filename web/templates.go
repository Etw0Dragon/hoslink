package web

import "html/template"

// Templates is shared by the server and the static preview, keeping one frontend.
func Templates() (*template.Template, error) {
	return template.New("pages").Funcs(template.FuncMap{
		"category": Category, "status": Status,
		"initial": func(s string) string {
			for _, r := range s {
				return string(r)
			}
			return "?"
		},
	}).ParseFS(Files, "templates/*.html")
}

func Category(s string) string {
	return map[string]string{"hotel": "Hôtel", "ski": "Location de skis", "spa": "Spa & bien-être", "activite": "Activités", "autre": "Autres services"}[s]
}

func Status(s string) string {
	if v := (map[string]string{"pending": "En attente", "approved": "Validé", "suspended": "Suspendu", "active": "Actif", "ended": "Terminé"})[s]; v != "" {
		return v
	}
	return s
}
