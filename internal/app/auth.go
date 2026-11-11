package app

import (
	"database/sql"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/url"
	"strings"
)

func (a *App) authPage(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimPrefix(r.URL.Path, "/")
	a.render(w, r, Page{Page: p, Title: "Votre espace professionnel", Token: r.URL.Query().Get("token")})
}
func (a *App) register(w http.ResponseWriter, r *http.Request) {
	if a.limited(w, r) {
		return
	}
	em := email(r)
	pw := r.FormValue("password")
	name := text(r, "name", 120)
	if !validEmail(em) || !passwordValid(pw) || name == "" {
		a.render(w, r, Page{Page: "inscription", Error: "Indiquez un nom, un email valide et un mot de passe de 12 à 72 octets."})
		return
	}
	h, e := bcrypt.GenerateFromPassword([]byte(pw), 12)
	if e != nil {
		a.internal(w, e)
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var uid int64
	e = tx.QueryRowContext(r.Context(), `INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id`, em, name, string(h)).Scan(&uid)
	if e == sql.ErrNoRows {
		a.render(w, r, Page{Page: "connexion", Success: "Si un compte existe déjà, connectez-vous ou utilisez la récupération de mot de passe."})
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	token := random()
	_, e = tx.ExecContext(r.Context(), `INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'verify',now()+interval '24 hours')`, hash(token), uid)
	if e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	if e = a.send(em, "Confirmez votre adresse", "/verifier?token="+token); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, Page{Page: "connexion", Success: "Compte créé. Consultez votre email pour confirmer votre adresse."})
}
func (a *App) verify(w http.ResponseWriter, r *http.Request) {
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var uid int64
	e = tx.QueryRowContext(r.Context(), `DELETE FROM tokens WHERE token_hash=$1 AND kind='verify' AND expires_at>now() RETURNING user_id`, hash(r.FormValue("token"))).Scan(&uid)
	if e != nil {
		fail(w, 400, "Lien invalide ou expiré.")
		return
	}
	if _, e = tx.ExecContext(r.Context(), `UPDATE users SET verified=true WHERE id=$1`, uid); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, Page{Page: "connexion", Success: "Email confirmé. Vous pouvez vous connecter."})
}
func (a *App) login(w http.ResponseWriter, r *http.Request) {
	if a.limited(w, r) {
		return
	}
	var uid int64
	var stored string
	e := a.DB.QueryRowContext(r.Context(), `SELECT id,password_hash FROM users WHERE email=$1`, email(r)).Scan(&uid, &stored)
	// Always perform the expensive comparison, including unknown accounts.
	if e == sql.ErrNoRows {
		stored = "$2a$12$7EqJtq98hPqEX7fNZaFWoO5P4jFfi9WJj6ZCtBSzC4f7nT7XPTN5a"
	} else if e != nil {
		a.internal(w, e)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(stored), []byte(r.FormValue("password"))) != nil || e != nil {
		a.render(w, r, Page{Page: "connexion", Error: "Email ou mot de passe incorrect."})
		return
	}
	var est sql.NullInt64
	if e = a.DB.QueryRowContext(r.Context(), `SELECT min(establishment_id) FROM memberships WHERE user_id=$1`, uid).Scan(&est); e != nil {
		a.internal(w, e)
		return
	}
	token := random()
	_, e = a.DB.ExecContext(r.Context(), `INSERT INTO sessions(token_hash,user_id,establishment_id,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`, hash(token), uid, est)
	if e != nil {
		a.internal(w, e)
		return
	}
	a.cookie(w, "session", token, 7*86400)
	a.cookie(w, "csrf", random(), 86400)
	if c, err := r.Cookie("directory_search"); err == nil {
		if values, err := url.ParseQuery(c.Value); err == nil {
			a.cookie(w, "directory_search", "", -1)
			redirect(w, r, "/annuaire?"+discoveryFilters(values).Encode())
			return
		}
	}
	redirect(w, r, "/compte")
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie("session"); e == nil {
		if _, e = a.DB.ExecContext(r.Context(), `DELETE FROM sessions WHERE token_hash=$1`, hash(c.Value)); e != nil {
			a.internal(w, e)
			return
		}
	}
	a.cookie(w, "session", "", -1)
	redirect(w, r, "/connexion")
}
func (a *App) forgot(w http.ResponseWriter, r *http.Request) {
	if a.limited(w, r) {
		return
	}
	var uid int64
	e := a.DB.QueryRowContext(r.Context(), `SELECT id FROM users WHERE email=$1`, email(r)).Scan(&uid)
	if e != nil && e != sql.ErrNoRows {
		a.internal(w, e)
		return
	}
	if e == nil {
		t := random()
		_, e = a.DB.ExecContext(r.Context(), `INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '30 minutes')`, hash(t), uid)
		if e != nil {
			a.internal(w, e)
			return
		}
		if e = a.send(email(r), "Réinitialisation du mot de passe", "/reinitialiser?token="+t); e != nil {
			a.internal(w, e)
			return
		}
	}
	a.render(w, r, Page{Page: "mot-de-passe", Success: "Si ce compte existe, un lien de réinitialisation a été envoyé."})
}
func (a *App) reset(w http.ResponseWriter, r *http.Request) {
	if a.limited(w, r) {
		return
	}
	pw := r.FormValue("password")
	if !passwordValid(pw) {
		fail(w, 400, "Mot de passe : 12 à 72 octets.")
		return
	}
	h, e := bcrypt.GenerateFromPassword([]byte(pw), 12)
	if e != nil {
		a.internal(w, e)
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var uid int64
	e = tx.QueryRowContext(r.Context(), `DELETE FROM tokens WHERE token_hash=$1 AND kind='reset' AND expires_at>now() RETURNING user_id`, hash(r.FormValue("token"))).Scan(&uid)
	if e != nil {
		fail(w, 400, "Lien invalide ou expiré.")
		return
	}
	// Lock the user so simultaneous resets cannot leave a usable old session.
	if _, e = tx.ExecContext(r.Context(), `UPDATE users SET password_hash=$1 WHERE id=$2`, string(h), uid); e != nil {
		a.internal(w, e)
		return
	}
	if _, e = tx.ExecContext(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, uid); e != nil {
		a.internal(w, e)
		return
	}
	if _, e = tx.ExecContext(r.Context(), `DELETE FROM tokens WHERE user_id=$1 AND kind='reset'`, uid); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, Page{Page: "connexion", Success: "Mot de passe modifié. Reconnectez-vous."})
}
func (a *App) resendVerification(w http.ResponseWriter, r *http.Request) {
	if a.limited(w, r) {
		return
	}
	u := user(r)
	if u.Verified {
		redirect(w, r, "/compte")
		return
	}
	token := random()
	_, e := a.DB.ExecContext(r.Context(), `INSERT INTO tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'verify',now()+interval '24 hours')`, hash(token), u.ID)
	if e != nil {
		a.internal(w, e)
		return
	}
	if e = a.send(u.Email, "Confirmez votre adresse", "/verifier?token="+token); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/compte")
}
