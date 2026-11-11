package app

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"

	"plateforme-partenaires/internal/store"
)

func testApp(t *testing.T, db *sql.DB) *App {
	t.Helper()
	a, e := New(db, Config{BaseURL: "http://localhost:8080", MailDir: t.TempDir(), MailFrom: "noreply@localhost"})
	if e != nil {
		t.Fatal(e)
	}
	return a
}
func TestPageRendering(t *testing.T) {
	a := testApp(t, nil)
	u := &Identity{ID: 1, Name: "Élodie", Verified: true, EstID: 1, EstName: "Hôtel pilote", Status: "approved", Role: "owner", Admin: true}
	for _, page := range []string{"search", "dashboard", "home", "inscription", "connexion", "mot-de-passe", "reinitialiser", "verifier", "invitation", "account", "directory", "profile", "team", "conversations", "conversation", "partnerships", "offers", "admin", "legal", "history"} {
		t.Run(page, func(t *testing.T) {
			p := Page{Page: page, Title: "Test", User: u, CSRF: strings.Repeat("a", 64), Item: Item{ID: 2, Name: "Spa", Category: "spa"}, Items: []Item{{ID: 1, OtherID: 2, Status: "pending", Version: 1, Name: "Spa", Category: "spa", Terms: "<script>alert(1)</script>"}}, Members: []Item{{ID: 2, Role: "member"}}}
			var b bytes.Buffer
			if e := a.templates.ExecuteTemplate(&b, "layout", p); e != nil {
				t.Fatal(e)
			}
			if strings.Contains(b.String(), "<script>alert(1)</script>") {
				t.Fatal("unescaped input")
			}
			if !strings.Contains(b.String(), "<!doctype html>") {
				t.Fatal("missing layout")
			}
		})
	}
}
func TestAnonymousAndCSRF(t *testing.T) {
	a := testApp(t, nil)
	h := a.Handler()
	for _, p := range []string{"/tableau-de-bord", "/annuaire", "/messages/1", "/documents/1", "/equipe", "/administration", "/partenariats/1/historique"} {
		r := httptest.NewRequest("GET", p, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 303 || w.Header().Get("Location") != "/connexion" {
			t.Fatalf("%s: %d", p, w.Code)
		}
	}
	for _, tc := range []struct{ origin, csrf string }{{"", ""}, {"https://evil.example", strings.Repeat("a", 64)}} {
		v := url.Values{"csrf": {tc.csrf}}
		r := httptest.NewRequest("POST", "/connexion", strings.NewReader(v.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		r.Header.Set("Origin", tc.origin)
		r.AddCookie(&http.Cookie{Name: "csrf", Value: strings.Repeat("a", 64)})
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("csrf bypass: %d", w.Code)
		}
	}
	r := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("missing CSP")
	}
}
func TestValidation(t *testing.T) {
	for _, s := range []string{"123", "0000000000000x", "73282932000075"} {
		if validSIRET(s) {
			t.Fatalf("invalid SIRET accepted: %s", s)
		}
	}
	if !validSIRET("73282932000074") {
		t.Fatal("valid SIRET refused")
	}
	if validPDF([]byte("not pdf")) || validPDF([]byte("%PDF-1.4 broken")) {
		t.Fatal("invalid PDF accepted")
	}
	if !validPDF([]byte("%PDF-1.4\nfixture\n%%EOF")) {
		t.Fatal("PDF structure refused")
	}
	if validEmail("Alice <alice@example.fr>") || !validEmail("alice@example.fr") {
		t.Fatal("email validation")
	}
	if passwordValid("short") || passwordValid(strings.Repeat("é", 37)) {
		t.Fatal("password length")
	}
}
func TestProductionConfig(t *testing.T) {
	if _, e := New(nil, Config{Production: true, BaseURL: "http://localhost", SMTPAddr: "smtp:587"}); e == nil {
		t.Fatal("HTTP production allowed")
	}
	if _, e := New(nil, Config{Production: true, BaseURL: "https://example.fr"}); e == nil {
		t.Fatal("missing SMTP allowed")
	}
}
func TestMailSpool(t *testing.T) {
	a := testApp(t, nil)
	if e := a.send("alice@example.fr", "Test", "/verifier?token=secret"); e != nil {
		t.Fatal(e)
	}
	entries, e := os.ReadDir(a.Config.MailDir)
	if e != nil || len(entries) != 1 {
		t.Fatal("missing email", e)
	}
	b, e := os.ReadFile(a.Config.MailDir + "/" + entries[0].Name())
	if e != nil || !bytes.Contains(b, []byte("http://localhost:8080/verifier?token=secret")) {
		t.Fatal("missing link")
	}
	info, _ := entries[0].Info()
	if info.Mode().Perm() != 0600 {
		t.Fatal("mail permissions")
	}
}
func TestLimiterConcurrent(t *testing.T) {
	l := &limiter{entries: map[string]attempt{}}
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if l.allow("ip") {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if allowed != 25 {
		t.Fatal(allowed)
	}
}

func integrationDB(t *testing.T) *sql.DB {
	t.Helper()
	s := os.Getenv("TEST_DATABASE_URL")
	if s == "" {
		t.Skip("TEST_DATABASE_URL absent : PostgreSQL requis pour ce test")
	}
	ctx := context.Background()
	base, e := store.Open(ctx, s)
	if e != nil {
		t.Fatal(e)
	}
	schema := "test_" + random()[:16]
	if _, e = base.Exec(`CREATE SCHEMA ` + schema); e != nil {
		t.Fatal(e)
	}
	u, e := url.Parse(s)
	if e != nil {
		t.Fatal(e)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, e := store.Open(ctx, u.String())
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close(); base.Exec(`DROP SCHEMA ` + schema + ` CASCADE`); base.Close() })
	if e = store.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	if e = store.Migrate(ctx, db); e != nil {
		t.Fatal("migration not idempotent", e)
	}
	return db
}
func seed(t *testing.T, db *sql.DB, n int) ([]int64, []string) {
	t.Helper()
	var ests []int64
	var sessions []string
	for i := 0; i < n; i++ {
		var uid, cid, eid int64
		em := fmt.Sprintf("u%d@example.fr", i)
		if e := db.QueryRow(`INSERT INTO users(email,name,password_hash,verified) VALUES($1,'Test','unused',true) RETURNING id`, em).Scan(&uid); e != nil {
			t.Fatal(e)
		}
		if e := db.QueryRow(`INSERT INTO companies(siren,name) VALUES($1,'Entreprise') RETURNING id`, fmt.Sprintf("%09d", i+1)).Scan(&cid); e != nil {
			t.Fatal(e)
		}
		if e := db.QueryRow(`INSERT INTO establishments(company_id,siret,name,category,station,city,address,status) VALUES($1,$2,$3,'hotel','Station','Ville','Adresse','approved') RETURNING id`, cid, fmt.Sprintf("%014d", i+1), fmt.Sprintf("Est %d", i)).Scan(&eid); e != nil {
			t.Fatal(e)
		}
		if _, e := db.Exec(`INSERT INTO memberships VALUES($1,$2,'owner')`, uid, eid); e != nil {
			t.Fatal(e)
		}
		s := random()
		if _, e := db.Exec(`INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 day')`, hash(s), uid, eid); e != nil {
			t.Fatal(e)
		}
		ests = append(ests, eid)
		sessions = append(sessions, s)
	}
	return ests, sessions
}
func request(a *App, method, path, session string, v url.Values) *httptest.ResponseRecorder {
	if v == nil {
		v = url.Values{}
	}
	token := strings.Repeat("a", 64)
	v.Set("csrf", token)
	r := httptest.NewRequest(method, path, strings.NewReader(v.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.AddCookie(&http.Cookie{Name: "csrf", Value: token})
	if session != "" {
		r.AddCookie(&http.Cookie{Name: "session", Value: session})
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}
func TestIntegrationIsolationAndCapacity(t *testing.T) {
	db := integrationDB(t)
	a := testApp(t, db)
	ids, s := seed(t, db, 5)
	w := request(a, "POST", "/messages", s[0], url.Values{"other": {fmt.Sprint(ids[1])}, "subject": {"Devis"}, "body": {"Message privé"}, "quote": {"1"}})
	if w.Code != 303 {
		t.Fatalf("create conversation: %d %s", w.Code, w.Body.String())
	}
	path := w.Header().Get("Location")
	for _, tc := range []struct {
		session string
		visible bool
	}{{s[0], true}, {s[1], true}, {s[2], false}} {
		page := request(a, "GET", "/tableau-de-bord", tc.session, nil)
		if page.Code != 200 {
			t.Fatalf("dashboard: %d %s", page.Code, page.Body.String())
		}
		if strings.Contains(page.Body.String(), `href="`+path+`"`) != tc.visible {
			t.Fatal("dashboard conversation isolation")
		}
	}
	if w = request(a, "GET", path, s[1], nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w = request(a, "GET", path, s[2], nil); w.Code != 404 {
		t.Fatal("conversation leaked", w.Code)
	}
	if w = request(a, "POST", path, s[2], url.Values{"body": {"intrusion"}}); w.Code != 404 {
		t.Fatal("message injection", w.Code)
	}
	// A normal URL-encoded reply without a file must reach the access check
	// and be saved for participants, while outsiders still receive 404.
	if w = request(a, "POST", path, s[1], url.Values{"body": {"Réponse sans pièce jointe"}}); w.Code != http.StatusSeeOther {
		t.Fatalf("text-only reply: %d %s", w.Code, w.Body.String())
	}
	var messageCount int
	if e := db.QueryRow(`SELECT count(*) FROM messages`).Scan(&messageCount); e != nil || messageCount != 2 {
		t.Fatalf("expected initial message and authorized reply only: count=%d err=%v", messageCount, e)
	}
	var mid, did int64
	if e := db.QueryRow(`SELECT id FROM messages LIMIT 1`).Scan(&mid); e != nil {
		t.Fatal(e)
	}
	if e := db.QueryRow(`INSERT INTO attachments(message_id,name,data) VALUES($1,'test.pdf',$2) RETURNING id`, mid, []byte("%PDF-1.4\n%%EOF")).Scan(&did); e != nil {
		t.Fatal(e)
	}
	if w = request(a, "GET", fmt.Sprintf("/documents/%d", did), s[2], nil); w.Code != 404 {
		t.Fatal("document leaked", w.Code)
	}
	if w = request(a, "GET", fmt.Sprintf("/documents/%d", did), s[1], nil); w.Code != 200 || w.Header().Get("Content-Disposition") == "" {
		t.Fatal("document access", w.Code)
	}
	// Three partners compete simultaneously for the remaining two free slots.
	var pids []int64
	for j := 1; j <= 3; j++ {
		w = request(a, "POST", "/partenariats", s[0], url.Values{"other": {fmt.Sprint(ids[j])}, "terms": {"Conditions initiales"}})
		if w.Code != 303 {
			t.Fatal(w.Code, w.Body.String())
		}
		var pid int64
		if e := db.QueryRow(`SELECT id FROM partnerships WHERE a=$1 AND b=$2`, ids[0], ids[j]).Scan(&pid); e != nil {
			t.Fatal(e)
		}
		pids = append(pids, pid)
	}
	var wg sync.WaitGroup
	codes := make(chan int, 3)
	for j, pid := range pids {
		wg.Add(1)
		go func(j int, pid int64) {
			defer wg.Done()
			w := request(a, "POST", fmt.Sprintf("/partenariats/%d/accepter", pid), s[j+1], url.Values{"version": {"1"}})
			codes <- w.Code
		}(j, pid)
	}
	wg.Wait()
	close(codes)
	ok, conflict := 0, 0
	for code := range codes {
		switch code {
		case 303:
			ok++
		case 409:
			conflict++
		default:
			t.Fatalf("unexpected status %d", code)
		}
	}
	if ok != 2 || conflict != 1 {
		t.Fatalf("capacity race: success=%d conflict=%d", ok, conflict)
	}
	var count int
	if e := db.QueryRow(`SELECT count(*) FROM partnerships WHERE status='active' AND a=$1`, ids[0]).Scan(&count); e != nil || count != 2 {
		t.Fatal("capacity exceeded", count, e)
	}
	if w = request(a, "POST", fmt.Sprintf("/partenariats/%d/terminer", pids[0]), s[4], url.Values{"version": {"1"}}); w.Code != 404 {
		t.Fatal("unauthorized mutation", w.Code)
	}
	if w = request(a, "POST", fmt.Sprintf("/partenariats/%d/modifier", pids[0]), s[0], url.Values{"version": {"1"}, "terms": {"Conditions modifiées"}}); w.Code != 303 {
		t.Fatal("version change", w.Code)
	}
	if w = request(a, "POST", fmt.Sprintf("/partenariats/%d/accepter", pids[0]), s[1], url.Values{"version": {"1"}}); w.Code != 409 {
		t.Fatal("stale version accepted", w.Code)
	}
}
func TestIntegrationExpiration(t *testing.T) {
	db := integrationDB(t)
	a := testApp(t, db)
	ids, s := seed(t, db, 4)
	if _, e := db.Exec(`UPDATE establishments SET subscription_until=now()+interval '1 hour' WHERE id=$1`, ids[0]); e != nil {
		t.Fatal(e)
	}
	for j := 1; j <= 3; j++ {
		if w := request(a, "POST", "/partenariats", s[0], url.Values{"other": {fmt.Sprint(ids[j])}, "terms": {"Accord"}}); w.Code != 303 {
			t.Fatal(w.Code)
		}
		var pid int64
		db.QueryRow(`SELECT id FROM partnerships WHERE a=$1 AND b=$2`, ids[0], ids[j]).Scan(&pid)
		if w := request(a, "POST", fmt.Sprintf("/partenariats/%d/accepter", pid), s[j], url.Values{"version": {"1"}}); w.Code != 303 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if _, e := db.Exec(`UPDATE establishments SET subscription_until=now()-interval '1 minute' WHERE id=$1`, ids[0]); e != nil {
		t.Fatal(e)
	}
	if e := a.reconcile(context.Background()); e != nil {
		t.Fatal(e)
	}
	var active, suspended int
	db.QueryRow(`SELECT count(*) FILTER(WHERE status='active'),count(*) FILTER(WHERE status='suspended') FROM partnerships`).Scan(&active, &suspended)
	if active != 2 || suspended != 1 {
		t.Fatal(active, suspended)
	}
}
func TestRoleGates(t *testing.T) {
	a := testApp(t, nil)
	for _, tc := range []struct {
		name, path      string
		u               Identity
		approved, owner bool
		code            int
	}{
		{"pending", "/annuaire", Identity{Verified: true, EstID: 1, Status: "pending", Role: "owner"}, true, false, 303},
		{"member cannot sign", "/partenariats", Identity{Verified: true, EstID: 1, Status: "approved", Role: "member"}, true, true, 403},
		{"owner can sign", "/partenariats", Identity{Verified: true, EstID: 1, Status: "approved", Role: "owner"}, true, true, 204},
		{"unverified account is reachable", "/compte", Identity{Verified: false}, false, false, 204},
		{"unverified directory refused", "/annuaire", Identity{Verified: false}, true, false, 303},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", tc.path, nil)
			r = r.WithContext(context.WithValue(r.Context(), identityKey, &tc.u))
			w := httptest.NewRecorder()
			a.require(tc.approved, tc.owner, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })(w, r)
			if w.Code != tc.code {
				t.Fatal(w.Code, tc.code)
			}
		})
	}
}

func TestTextMessageWithoutAttachment(t *testing.T) {
	a := testApp(t, nil)
	r := httptest.NewRequest(http.MethodPost, "/messages/1", strings.NewReader("body="))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	a.sendMessage(w, r)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "Ajoutez un message ou un PDF.") {
		t.Fatalf("text form was mistaken for an invalid attachment: %d %s", w.Code, w.Body.String())
	}
}

func TestPartnershipActionsReflectRoleAndAcceptance(t *testing.T) {
	a := testApp(t, nil)
	for _, tc := range []struct {
		name, role          string
		accepted, canAccept bool
	}{
		{"owner to review", "owner", false, true},
		{"owner already accepted", "owner", true, false},
		{"member read only", "member", false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := Page{Page: "partnerships", User: &Identity{Role: tc.role}, Items: []Item{{ID: 12, OtherID: 2, Name: "Partenaire", Status: "pending", Version: 1, Accepted: tc.accepted}}}
			var b bytes.Buffer
			if err := a.templates.ExecuteTemplate(&b, "layout", p); err != nil {
				t.Fatal(err)
			}
			if strings.Contains(b.String(), `action="/partenariats/12/accepter"`) != tc.canAccept {
				t.Fatal("incorrect accept action")
			}
			if tc.role == "member" && strings.Contains(b.String(), `action="/partenariats/12/terminer"`) {
				t.Fatal("member offered owner action")
			}
		})
	}
}
