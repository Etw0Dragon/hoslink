package app

import (
	"net/http"
	"net/url"
	"strings"
)

func (a *App) presentation(w http.ResponseWriter, r *http.Request) {
	a.render(w, r, Page{Page: "home", Title: "Le réseau des hôtels et prestataires"})
}

// Keep only known directory filters; never redirect to a user-provided URL.
func discoveryFilters(values url.Values) url.Values {
	result := url.Values{}
	for _, field := range []string{"q", "station"} {
		value := strings.TrimSpace(values.Get(field))
		limit := 160
		if field == "station" {
			limit = 100
		}
		if len([]rune(value)) > limit {
			value = string([]rune(value)[:limit])
		}
		if value != "" {
			result.Set(field, value)
		}
	}
	if value := values.Get("category"); category(value) != "" {
		result.Set("category", value)
	}
	return result
}

func (a *App) searchEntry(w http.ResponseWriter, r *http.Request) {
	filters := discoveryFilters(r.URL.Query())
	if u := user(r); u != nil && u.Verified && u.Status == "approved" {
		redirect(w, r, "/annuaire?"+filters.Encode())
		return
	}
	// This short-lived cookie contains search preferences, never private results.
	a.cookie(w, "directory_search", filters.Encode(), 1800)
	a.render(w, r, Page{Page: "search", Title: "Votre recherche de partenaires", Query: filters.Get("q"), Station: filters.Get("station"), Category: filters.Get("category")})
}
