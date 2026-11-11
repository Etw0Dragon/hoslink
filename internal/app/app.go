package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"plateforme-partenaires/web"
)

type Config struct {
	BaseURL, Address, MailDir, SMTPAddr, SMTPUser, SMTPPassword, MailFrom string
	Production                                                            bool
}
type App struct {
	DB        *sql.DB
	Config    Config
	templates *template.Template
	limiter   *limiter
}
type Identity struct {
	ID, EstID                          int64
	Name, Email, Role, EstName, Status string
	Verified, Admin                    bool
}
type Item struct {
	ID, OtherID                                                                                    int64
	Name, Category, Station, City, Description, Status, Role, Terms, Subject, Body, Date, FileName string
	Version, Count                                                                                 int
	Accepted, Quote, Unlimited                                                                     bool
}
type Page struct {
	Title, Page, Error, Success, CSRF, Token, Query, Category, Station string
	User                                                               *Identity
	Items, Messages, Members, Establishments                           []Item
	Item                                                               Item
	Slots, Active, Pending                                             int
	Unlimited                                                          bool
}
type key int

const identityKey key = 1

func New(db *sql.DB, c Config) (*App, error) {
	t, err := web.Templates()
	if err != nil {
		return nil, err
	}
	if c.Production {
		u, e := url.Parse(c.BaseURL)
		if e != nil || u.Scheme != "https" || u.Host == "" {
			return nil, errors.New("BASE_URL HTTPS obligatoire en production")
		}
		if c.SMTPAddr == "" {
			return nil, errors.New("SMTP_ADDR obligatoire en production")
		}
	}
	return &App{DB: db, Config: c, templates: t, limiter: &limiter{entries: map[string]attempt{}}}, nil
}
func category(s string) string { return web.Category(s) }
func status(s string) string   { return web.Status(s) }
func random() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func hash(s string) string           { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func id(r *http.Request) int64       { v, _ := strconv.ParseInt(r.PathValue("id"), 10, 64); return v }
func user(r *http.Request) *Identity { u, _ := r.Context().Value(identityKey).(*Identity); return u }
func (a *App) cookie(w http.ResponseWriter, name, value string, max int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: a.Config.Production, SameSite: http.SameSiteLaxMode, MaxAge: max})
}
func (a *App) render(w http.ResponseWriter, r *http.Request, p Page) {
	p.User = user(r)
	if c, e := r.Cookie("csrf"); e == nil {
		p.CSRF = c.Value
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if e := a.templates.ExecuteTemplate(w, "layout", p); e != nil {
		slog.Error("template", "error", e)
	}
}
func fail(w http.ResponseWriter, code int, msg string) { http.Error(w, msg, code) }
func redirect(w http.ResponseWriter, r *http.Request, path string) {
	http.Redirect(w, r, path, http.StatusSeeOther)
}
func (a *App) internal(w http.ResponseWriter, e error) {
	slog.Error("request failed", "error", e)
	fail(w, 500, "Une erreur est survenue. Réessayez.")
}
func (a *App) routes() http.Handler {
	m := http.NewServeMux()
	m.Handle("GET /public/", http.StripPrefix("/public/", http.FileServerFS(publicFiles)))
	m.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(staticFiles)))
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if e := a.DB.PingContext(ctx); e != nil {
			fail(w, 503, "unavailable")
			return
		}
		fmt.Fprint(w, "ok")
	})
	m.HandleFunc("GET /{$}", a.home)
	m.HandleFunc("GET /presentation", a.presentation)
	m.HandleFunc("GET /recherche", a.searchEntry)
	m.HandleFunc("GET /connexion", a.authPage)
	m.HandleFunc("POST /connexion", a.login)
	m.HandleFunc("GET /inscription", a.authPage)
	m.HandleFunc("POST /inscription", a.register)
	m.HandleFunc("GET /mot-de-passe", a.authPage)
	m.HandleFunc("POST /mot-de-passe", a.forgot)
	m.HandleFunc("GET /reinitialiser", a.authPage)
	m.HandleFunc("POST /reinitialiser", a.reset)
	m.HandleFunc("GET /verifier", a.authPage)
	m.HandleFunc("POST /verifier", a.verify)
	m.HandleFunc("GET /invitation", a.authPage)
	m.HandleFunc("POST /invitation", a.acceptInvite)
	m.HandleFunc("GET /informations", func(w http.ResponseWriter, r *http.Request) {
		a.render(w, r, Page{Page: "legal", Title: "Informations"})
	})
	m.HandleFunc("POST /deconnexion", a.require(false, false, a.logout))
	m.HandleFunc("POST /renvoyer-verification", a.require(false, false, a.resendVerification))
	m.HandleFunc("GET /partenariats/{id}/historique", a.require(true, false, a.history))
	m.HandleFunc("POST /signalements", a.require(true, false, a.report))
	m.HandleFunc("GET /compte", a.require(false, false, a.account))
	m.HandleFunc("POST /etablissement", a.require(false, false, a.createEstablishment))
	m.HandleFunc("POST /changer", a.require(false, false, a.switchEstablishment))
	m.HandleFunc("GET /tableau-de-bord", a.require(true, false, a.dashboard))
	m.HandleFunc("GET /annuaire", a.require(true, false, a.directory))
	m.HandleFunc("GET /etablissements/{id}", a.require(true, false, a.profile))
	m.HandleFunc("POST /fiche", a.require(true, true, a.editProfile))
	m.HandleFunc("GET /equipe", a.require(true, false, a.team))
	m.HandleFunc("POST /equipe/inviter", a.require(true, true, a.invite))
	m.HandleFunc("POST /equipe/{id}/retirer", a.require(true, true, a.removeMember))
	m.HandleFunc("GET /messages", a.require(true, false, a.conversations))
	m.HandleFunc("POST /messages", a.require(true, false, a.startConversation))
	m.HandleFunc("GET /messages/{id}", a.require(true, false, a.conversation))
	m.HandleFunc("POST /messages/{id}", a.require(true, false, a.sendMessage))
	m.HandleFunc("GET /documents/{id}", a.require(true, false, a.download))
	m.HandleFunc("GET /partenariats", a.require(true, false, a.partnerships))
	m.HandleFunc("POST /partenariats", a.require(true, true, a.propose))
	m.HandleFunc("POST /partenariats/{id}/{action}", a.require(true, true, a.partnershipAction))
	m.HandleFunc("GET /offres", a.require(true, false, a.offers))
	m.HandleFunc("GET /administration", a.require(false, false, a.admin))
	m.HandleFunc("POST /administration/{id}", a.require(false, false, a.moderate))
	return a.middleware(m)
}
func (a *App) Handler() http.Handler { return a.routes() }
func (a *App) require(approved, owner bool, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := user(r)
		if u == nil {
			redirect(w, r, "/connexion")
			return
		}
		if !u.Verified && r.URL.Path != "/compte" && r.URL.Path != "/deconnexion" && r.URL.Path != "/renvoyer-verification" {
			redirect(w, r, "/compte")
			return
		}
		if approved && (u.EstID == 0 || u.Status != "approved") {
			redirect(w, r, "/compte")
			return
		}
		if owner && u.Role != "owner" {
			fail(w, 403, "Action réservée au responsable.")
			return
		}
		next(w, r)
	}
}
func (a *App) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		w.Header().Set("Cache-Control", "no-store")
		if a.Config.Production {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		r.Body = http.MaxBytesReader(w, r.Body, 6<<20)
		csrf, e := r.Cookie("csrf")
		if e != nil || len(csrf.Value) != 64 {
			csrf = &http.Cookie{Value: random()}
			a.cookie(w, "csrf", csrf.Value, 86400)
			r.AddCookie(&http.Cookie{Name: "csrf", Value: csrf.Value})
		}
		if r.Method == "POST" {
			if origin := r.Header.Get("Origin"); origin != "" && origin != a.Config.BaseURL {
				fail(w, 403, "Origine refusée.")
				return
			}
			if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
				e = r.ParseMultipartForm(1 << 20)
				if r.MultipartForm != nil {
					defer r.MultipartForm.RemoveAll()
				}
			} else {
				e = r.ParseForm()
			}
			if e != nil {
				fail(w, 413, "Formulaire trop volumineux ou invalide.")
				return
			}
			if r.FormValue("csrf") == "" || r.FormValue("csrf") != csrf.Value {
				fail(w, 403, "Session de formulaire expirée. Rechargez la page.")
				return
			}
		}
		if c, e := r.Cookie("session"); e == nil {
			u := &Identity{}
			e = a.DB.QueryRowContext(r.Context(), `SELECT u.id,u.name,u.email,u.verified,u.admin,COALESCE(e.id,0),COALESCE(e.name,''),COALESCE(e.status,''),COALESCE(m.role,'') FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN memberships m ON m.user_id=u.id AND m.establishment_id=s.establishment_id LEFT JOIN establishments e ON e.id=m.establishment_id WHERE s.token_hash=$1 AND s.expires_at>now()`, hash(c.Value)).Scan(&u.ID, &u.Name, &u.Email, &u.Verified, &u.Admin, &u.EstID, &u.EstName, &u.Status, &u.Role)
			if e == nil {
				r = r.WithContext(context.WithValue(r.Context(), identityKey, u))
			} else if e != sql.ErrNoRows {
				a.internal(w, e)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func (a *App) send(to, subject, path string) error {
	body := "From: " + a.Config.MailFrom + "\r\nTo: " + to + "\r\nSubject: " + subject + "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + a.Config.BaseURL + path + "\r\nCe lien est personnel. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message."
	if a.Config.SMTPAddr != "" {
		host, _, e := net.SplitHostPort(a.Config.SMTPAddr)
		if e != nil {
			return e
		}
		var auth smtp.Auth
		if a.Config.SMTPUser != "" {
			auth = smtp.PlainAuth("", a.Config.SMTPUser, a.Config.SMTPPassword, host)
		}
		return smtp.SendMail(a.Config.SMTPAddr, auth, a.Config.MailFrom, []string{to}, []byte(body))
	}
	if a.Config.Production {
		return errors.New("email non configuré")
	}
	if e := os.MkdirAll(a.Config.MailDir, 0700); e != nil {
		return e
	}
	return os.WriteFile(filepath.Join(a.Config.MailDir, random()+".eml"), []byte(body), 0600)
}
func validEmail(s string) bool {
	v, e := mail.ParseAddress(s)
	return e == nil && v.Address == s && len(s) <= 254
}
func email(r *http.Request) string { return strings.ToLower(strings.TrimSpace(r.FormValue("email"))) }
func passwordValid(s string) bool  { return len(s) >= 12 && len(s) <= 72 }
func text(r *http.Request, k string, max int) string {
	s := strings.TrimSpace(r.FormValue(k))
	if len(s) > max {
		return ""
	}
	return s
}
func (a *App) limited(w http.ResponseWriter, r *http.Request) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if !a.limiter.allow(host) {
		fail(w, 429, "Trop de tentatives. Réessayez dans 15 minutes.")
		return true
	}
	return false
}

type attempt struct {
	n     int
	start time.Time
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]attempt
}

func (l *limiter) allow(k string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for key, v := range l.entries {
		if now.Sub(v.start) > 15*time.Minute {
			delete(l.entries, key)
		}
	}
	v := l.entries[k]
	if v.start.IsZero() {
		v.start = now
	}
	v.n++
	l.entries[k] = v
	return v.n <= 25
}
