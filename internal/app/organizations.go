package app

import (
	"database/sql"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

func (a *App) home(w http.ResponseWriter, r *http.Request) {
	if user(r) != nil {
		if user(r).Status == "approved" {
			redirect(w, r, "/tableau-de-bord")
		} else {
			redirect(w, r, "/compte")
		}
		return
	}
	a.render(w, r, Page{Page: "home", Title: "Le réseau des hôtels et prestataires"})
}
func (a *App) account(w http.ResponseWriter, r *http.Request) {
	u := user(r)
	p := Page{Page: "account", Title: "Mon établissement"}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT e.id,e.name,e.status,m.role FROM memberships m JOIN establishments e ON e.id=m.establishment_id WHERE m.user_id=$1 ORDER BY e.name`, u.ID)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.Name, &i.Status, &i.Role); e != nil {
			a.internal(w, e)
			return
		}
		p.Establishments = append(p.Establishments, i)
	}
	if e = rows.Err(); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, p)
}
func validSIRET(s string) bool {
	if !regexp.MustCompile(`^[0-9]{14}$`).MatchString(s) {
		return false
	}
	sum := 0
	for i, c := range s {
		n := int(c - '0')
		if i%2 == 0 {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
	}
	return sum%10 == 0
}
func (a *App) createEstablishment(w http.ResponseWriter, r *http.Request) {
	u := user(r)
	siret := strings.ReplaceAll(text(r, "siret", 30), " ", "")
	name := text(r, "name", 160)
	company := text(r, "company", 160)
	cat := text(r, "category", 30)
	station := text(r, "station", 100)
	city := text(r, "city", 100)
	address := text(r, "address", 250)
	if !validSIRET(siret) || name == "" || company == "" || category(cat) == "" || station == "" || city == "" || address == "" {
		fail(w, 400, "Renseignez les informations obligatoires et un SIRET valide. Pour les cas particuliers, contactez l’administrateur.")
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var cid, eid int64
	// Serialise creations for the same legal entity. A public identifier is not a claim token.
	if _, e = tx.ExecContext(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, siret[:9]); e != nil {
		a.internal(w, e)
		return
	}
	e = tx.QueryRowContext(r.Context(), `SELECT id FROM companies WHERE siren=$1`, siret[:9]).Scan(&cid)
	if e == nil {
		var owns bool
		e = tx.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM memberships m JOIN establishments e ON e.id=m.establishment_id WHERE e.company_id=$1 AND m.user_id=$2 AND m.role='owner')`, cid, u.ID).Scan(&owns)
		if e != nil {
			a.internal(w, e)
			return
		}
		if !owns {
			fail(w, 409, "Entreprise déjà enregistrée. Demandez une invitation ou un rattachement à l’administrateur.")
			return
		}
	} else if e == sql.ErrNoRows {
		e = tx.QueryRowContext(r.Context(), `INSERT INTO companies(siren,name) VALUES($1,$2) RETURNING id`, siret[:9], company).Scan(&cid)
		if e != nil {
			a.internal(w, e)
			return
		}
	} else {
		a.internal(w, e)
		return
	}
	e = tx.QueryRowContext(r.Context(), `INSERT INTO establishments(company_id,siret,name,category,station,city,address,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(siret) DO NOTHING RETURNING id`, cid, siret, name, cat, station, city, address, text(r, "description", 3000)).Scan(&eid)
	if e == sql.ErrNoRows {
		fail(w, 409, "Établissement déjà enregistré. Demandez une invitation.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	if _, e = tx.ExecContext(r.Context(), `INSERT INTO memberships VALUES($1,$2,'owner')`, u.ID, eid); e != nil {
		a.internal(w, e)
		return
	}
	c, _ := r.Cookie("session")
	if _, e = tx.ExecContext(r.Context(), `UPDATE sessions SET establishment_id=$1 WHERE token_hash=$2`, eid, hash(c.Value)); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/compte")
}
func (a *App) switchEstablishment(w http.ResponseWriter, r *http.Request) {
	eid, _ := strconv.ParseInt(r.FormValue("establishment"), 10, 64)
	c, _ := r.Cookie("session")
	res, e := a.DB.ExecContext(r.Context(), `UPDATE sessions SET establishment_id=$1 WHERE token_hash=$2 AND EXISTS(SELECT 1 FROM memberships WHERE user_id=$3 AND establishment_id=$1)`, eid, hash(c.Value), user(r).ID)
	if e != nil {
		a.internal(w, e)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		fail(w, 403, "Établissement inaccessible.")
		return
	}
	redirect(w, r, "/compte")
}
func (a *App) directory(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "directory", Title: "Rencontrez vos prochains partenaires", Query: r.URL.Query().Get("q"), Category: r.URL.Query().Get("category"), Station: r.URL.Query().Get("station")}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT id,name,category,station,city,description FROM establishments WHERE status='approved' AND id<>$1 AND ($2='' OR name ILIKE '%'||$2||'%' OR description ILIKE '%'||$2||'%') AND ($3='' OR category=$3) AND ($4='' OR station ILIKE '%'||$4||'%') ORDER BY name LIMIT 100`, user(r).EstID, p.Query, p.Category, p.Station)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.Name, &i.Category, &i.Station, &i.City, &i.Description); e != nil {
			a.internal(w, e)
			return
		}
		p.Items = append(p.Items, i)
	}
	if e = rows.Err(); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, p)
}
func (a *App) profile(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "profile", Title: "Établissement"}
	e := a.DB.QueryRowContext(r.Context(), `SELECT id,name,category,station,city,description,address,siret FROM establishments WHERE id=$1 AND status='approved'`, id(r)).Scan(&p.Item.ID, &p.Item.Name, &p.Item.Category, &p.Item.Station, &p.Item.City, &p.Item.Description, &p.Item.Body, &p.Item.Subject)
	if e == sql.ErrNoRows {
		fail(w, 404, "Établissement introuvable.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	p.Title = p.Item.Name
	a.render(w, r, p)
}
func (a *App) editProfile(w http.ResponseWriter, r *http.Request) {
	desc := text(r, "description", 3000)
	if _, e := a.DB.ExecContext(r.Context(), `UPDATE establishments SET description=$1 WHERE id=$2`, desc, user(r).EstID); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/etablissements/"+strconv.FormatInt(user(r).EstID, 10))
}
func (a *App) team(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "team", Title: "Votre équipe"}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.establishment_id=$1 ORDER BY u.name`, user(r).EstID)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.Name, &i.Description, &i.Role); e != nil {
			a.internal(w, e)
			return
		}
		p.Members = append(p.Members, i)
	}
	if e = rows.Err(); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, p)
}
func (a *App) invite(w http.ResponseWriter, r *http.Request) {
	if a.limited(w, r) {
		return
	}
	em := email(r)
	if !validEmail(em) {
		fail(w, 400, "Email invalide.")
		return
	}
	t := random()
	_, e := a.DB.ExecContext(r.Context(), `INSERT INTO tokens(token_hash,kind,establishment_id,email,expires_at) VALUES($1,'invite',$2,$3,now()+interval '48 hours')`, hash(t), user(r).EstID, em)
	if e != nil {
		a.internal(w, e)
		return
	}
	if e = a.send(em, "Invitation à rejoindre un établissement", "/invitation?token="+t); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/equipe")
}
func (a *App) acceptInvite(w http.ResponseWriter, r *http.Request) {
	u := user(r)
	if u == nil || !u.Verified {
		fail(w, 403, "Connectez-vous avec un compte dont l’email est confirmé, puis rouvrez l’invitation.")
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var eid int64
	e = tx.QueryRowContext(r.Context(), `DELETE FROM tokens WHERE token_hash=$1 AND kind='invite' AND email=$2 AND expires_at>now() RETURNING establishment_id`, hash(r.FormValue("token")), u.Email).Scan(&eid)
	if e != nil {
		fail(w, 400, "Invitation invalide, expirée ou destinée à un autre compte.")
		return
	}
	if _, e = tx.ExecContext(r.Context(), `INSERT INTO memberships VALUES($1,$2,'member') ON CONFLICT DO NOTHING`, u.ID, eid); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/compte")
}
func (a *App) removeMember(w http.ResponseWriter, r *http.Request) {
	res, e := a.DB.ExecContext(r.Context(), `DELETE FROM memberships WHERE establishment_id=$1 AND user_id=$2 AND role='member'`, user(r).EstID, id(r))
	if e != nil {
		a.internal(w, e)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		fail(w, 400, "Ce membre ne peut pas être retiré.")
		return
	}
	redirect(w, r, "/equipe")
}
func (a *App) admin(w http.ResponseWriter, r *http.Request) {
	if !user(r).Admin {
		fail(w, 403, "Accès réservé à l’administration.")
		return
	}
	p := Page{Page: "admin", Title: "Validation des professionnels"}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT e.id,e.name,e.status,e.siret,e.address,e.city,e.station,c.name || ' · Responsables : ' || COALESCE((SELECT string_agg(u.name || ' <' || u.email || '>', ', ') FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.establishment_id=e.id AND m.role='owner'),'') FROM establishments e JOIN companies c ON c.id=e.company_id ORDER BY e.status,e.created_at LIMIT 200`)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.Name, &i.Status, &i.Subject, &i.Body, &i.City, &i.Station, &i.Description); e != nil {
			a.internal(w, e)
			return
		}
		p.Items = append(p.Items, i)
	}
	if e = rows.Err(); e != nil {
		a.internal(w, e)
		return
	}
	rows.Close()
	audits, err := a.DB.QueryContext(r.Context(), `SELECT a.entity_id,a.action,a.note,COALESCE(u.email,'Système'),to_char(a.created_at,'DD/MM/YYYY HH24:MI') FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100`)
	if err != nil {
		a.internal(w, err)
		return
	}
	defer audits.Close()
	for audits.Next() {
		var i Item
		if err = audits.Scan(&i.ID, &i.Subject, &i.Body, &i.Name, &i.Date); err != nil {
			a.internal(w, err)
			return
		}
		p.Messages = append(p.Messages, i)
	}
	if err = audits.Err(); err != nil {
		a.internal(w, err)
		return
	}
	a.render(w, r, p)
}
func (a *App) moderate(w http.ResponseWriter, r *http.Request) {
	if !user(r).Admin {
		fail(w, 403, "Accès refusé.")
		return
	}
	s := r.FormValue("status")
	note := text(r, "note", 1000)
	if (s != "approved" && s != "suspended") || note == "" {
		fail(w, 400, "Statut et justification obligatoires. Confirmez le contrôle du représentant pour valider.")
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	res, e := tx.ExecContext(r.Context(), `UPDATE establishments SET status=$1 WHERE id=$2`, s, id(r))
	if e != nil {
		a.internal(w, e)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		fail(w, 404, "Introuvable.")
		return
	}
	if _, e = tx.ExecContext(r.Context(), `INSERT INTO audit(user_id,action,entity_id,note) VALUES($1,$2,$3,$4)`, user(r).ID, s, id(r), note); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/administration")
}
func (a *App) report(w http.ResponseWriter, r *http.Request) {
	other, _ := strconv.ParseInt(r.FormValue("other"), 10, 64)
	note := text(r, "note", 1000)
	if other <= 0 || note == "" {
		fail(w, 400, "Motif obligatoire.")
		return
	}
	_, e := a.DB.ExecContext(r.Context(), `INSERT INTO audit(user_id,action,entity_id,note) SELECT $1,'report',id,$3 FROM establishments WHERE id=$2 AND status='approved'`, user(r).ID, other, note)
	if e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/compte")
}
