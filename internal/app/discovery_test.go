package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestPublicPresentationWhileConnected(t *testing.T) {
	a := testApp(t, nil)
	r := httptest.NewRequest("GET", "/presentation", nil)
	r = r.WithContext(context.WithValue(r.Context(), identityKey, &Identity{Status: "approved", Verified: true, EstID: 1}))
	w := httptest.NewRecorder()
	a.presentation(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `class="market-hero"`) {
		t.Fatal("public presentation unavailable to signed-in users")
	}
}

func TestDiscoveryGateAndPrivateRedirect(t *testing.T) {
	a := testApp(t, nil)
	for _, tc := range []struct {
		name string
		u    *Identity
		code int
	}{
		{"anonymous", nil, 200},
		{"unapproved", &Identity{Verified: true, Status: "pending", EstID: 1}, 200},
		{"approved", &Identity{Verified: true, Status: "approved", EstID: 1}, 303},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/recherche?q=kayak&station=Nice&category=activite&next=https://evil.example", nil)
			if tc.u != nil {
				r = r.WithContext(context.WithValue(r.Context(), identityKey, tc.u))
			}
			w := httptest.NewRecorder()
			a.searchEntry(w, r)
			if w.Code != tc.code {
				t.Fatal(w.Code, w.Body.String())
			}
			if tc.code == 303 {
				if w.Header().Get("Location") != "/annuaire?category=activite&q=kayak&station=Nice" {
					t.Fatal("unsafe or missing search filters", w.Header())
				}
			} else {
				if !strings.Contains(w.Body.String(), "kayak") || strings.Contains(w.Body.String(), `class="listing card"`) {
					t.Fatal("search gate missing or private results exposed")
				}
				cookies := w.Result().Cookies()
				if len(cookies) != 1 || cookies[0].Name != "directory_search" || !cookies[0].HttpOnly || cookies[0].MaxAge != 1800 {
					t.Fatal("search not preserved safely")
				}
			}
		})
	}
}

func TestDiscoveryFiltersAreBoundedAndAllowlisted(t *testing.T) {
	v := url.Values{"q": {strings.Repeat("é", 180)}, "station": {strings.Repeat("a", 130)}, "category": {"invalid"}, "next": {"https://evil.example"}}
	got := discoveryFilters(v)
	if len([]rune(got.Get("q"))) != 160 || len(got.Get("station")) != 100 || got.Get("category") != "" || got.Get("next") != "" {
		t.Fatal("unbounded or unsupported search filter")
	}
}

func TestLocalMediaAndVideoRangeRequests(t *testing.T) {
	a := testApp(t, nil)
	for _, path := range []string{"/public/logo.png", "/static/landing.css", "/static/media/hotel.webp", "/static/media/activities.webp", "/static/media/wellness.webp", "/static/media/hospitality.webp", "/static/media/film-poster.webp", "/static/media/introduction.fr.vtt"} {
		r := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		if w.Code != 200 || w.Body.Len() == 0 {
			t.Fatalf("missing local asset %s: %d", path, w.Code)
		}
	}
	r := httptest.NewRequest("GET", "/static/media/hotlink-introduction.mp4", nil)
	r.Header.Set("Range", "bytes=0-31")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 206 || w.Body.Len() != 32 || w.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("video seeking unavailable: %d %v", w.Code, w.Header())
	}
}

func TestIntegrationDiscoverySurvivesLogin(t *testing.T) {
	db := integrationDB(t)
	a := testApp(t, db)
	seed(t, db, 1)
	password := "test-password-long"
	encoded, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE users SET password_hash=$1 WHERE email='u0@example.fr'`, string(encoded)); err != nil {
		t.Fatal(err)
	}
	searchRequest := httptest.NewRequest("GET", "/recherche?category=spa&station=Nice&q=massage", nil)
	searchResponse := httptest.NewRecorder()
	a.Handler().ServeHTTP(searchResponse, searchRequest)
	csrf := strings.Repeat("a", 64)
	form := url.Values{"email": {"u0@example.fr"}, "password": {password}, "csrf": {csrf}}
	r := httptest.NewRequest("POST", "/connexion", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.AddCookie(&http.Cookie{Name: "csrf", Value: csrf})
	for _, cookie := range searchResponse.Result().Cookies() {
		if cookie.Name == "directory_search" {
			r.AddCookie(cookie)
		}
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	if w.Code != 303 || w.Header().Get("Location") != "/annuaire?category=spa&q=massage&station=Nice" {
		t.Fatalf("search lost after login: %d %v", w.Code, w.Header())
	}
}
