package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"time"
)

var ErrCapacity = errors.New("Les deux établissements doivent disposer d’une place libre. L’accord reste en attente.")

// lockPair is the single lock order for all capacity-changing operations.
func lockPair(ctx context.Context, tx *sql.Tx, x, y int64) error {
	a, b := pair(x, y)
	rows, e := tx.QueryContext(ctx, `SELECT id FROM establishments WHERE id IN ($1,$2) ORDER BY id FOR UPDATE`, a, b)
	if e != nil {
		return e
	}
	defer rows.Close()
	for rows.Next() {
		var v int64
		if e = rows.Scan(&v); e != nil {
			return e
		}
	}
	return rows.Err()
}
func available(ctx context.Context, tx *sql.Tx, eid int64) (bool, error) {
	var ok bool
	e := tx.QueryRowContext(ctx, `SELECT status='approved' AND (COALESCE(subscription_until>now(),false) OR (SELECT count(*) FROM partnerships WHERE status='active' AND (a=$1 OR b=$1)) < 2+purchased_slots) FROM establishments WHERE id=$1`, eid).Scan(&ok)
	return ok, e
}
func (a *App) partnerships(w http.ResponseWriter, r *http.Request) {
	if e := a.reconcile(r.Context()); e != nil {
		a.internal(w, e)
		return
	}
	p := Page{Page: "partnerships", Title: "Vos partenariats"}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT p.id,e.id,e.name,p.status,p.version,v.terms,CASE WHEN p.a=$1 THEN p.accepted_a ELSE p.accepted_b END,to_char(p.created_at,'DD/MM/YYYY') FROM partnerships p JOIN establishments e ON e.id=CASE WHEN p.a=$1 THEN p.b ELSE p.a END JOIN partnership_versions v ON v.partnership_id=p.id AND v.version=p.version WHERE p.a=$1 OR p.b=$1 ORDER BY p.id DESC`, user(r).EstID)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.OtherID, &i.Name, &i.Status, &i.Version, &i.Terms, &i.Accepted, &i.Date); e != nil {
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
func (a *App) propose(w http.ResponseWriter, r *http.Request) {
	other, _ := strconv.ParseInt(r.FormValue("other"), 10, 64)
	u := user(r)
	terms := text(r, "terms", 10000)
	if other <= 0 || other == u.EstID || terms == "" {
		fail(w, 400, "Choisissez un partenaire et précisez les conditions.")
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	x, y := pair(u.EstID, other)
	if e = lockPair(r.Context(), tx, x, y); e != nil {
		a.internal(w, e)
		return
	}
	var approved bool
	if e = tx.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM establishments WHERE id=$1 AND status='approved')`, other).Scan(&approved); e != nil {
		a.internal(w, e)
		return
	}
	if !approved {
		fail(w, 404, "Partenaire inaccessible.")
		return
	}
	var pid int64
	e = tx.QueryRowContext(r.Context(), `INSERT INTO partnerships(a,b,accepted_a,accepted_b) VALUES($1,$2,$3,$4) ON CONFLICT(a,b) DO NOTHING RETURNING id`, x, y, u.EstID == x, u.EstID == y).Scan(&pid)
	if e == sql.ErrNoRows {
		fail(w, 409, "Une relation existe déjà. Modifiez ou réactivez son accord depuis vos partenariats.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	if _, e = tx.ExecContext(r.Context(), `INSERT INTO partnership_versions VALUES($1,1,$2,$3,now())`, pid, terms, u.ID); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/partenariats")
}
func (a *App) partnershipAction(w http.ResponseWriter, r *http.Request) {
	if e := a.reconcile(r.Context()); e != nil {
		a.internal(w, e)
		return
	}
	u := user(r)
	ctx := r.Context()
	tx, e := a.DB.BeginTx(ctx, nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var x, y int64
	e = tx.QueryRowContext(ctx, `SELECT a,b FROM partnerships WHERE id=$1 AND (a=$2 OR b=$2)`, id(r), u.EstID).Scan(&x, &y)
	if e == sql.ErrNoRows {
		fail(w, 404, "Accord introuvable.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	if e = lockPair(ctx, tx, x, y); e != nil {
		a.internal(w, e)
		return
	}
	var state string
	var version int
	var aa, ab bool
	e = tx.QueryRowContext(ctx, `SELECT status,version,accepted_a,accepted_b FROM partnerships WHERE id=$1 FOR UPDATE`, id(r)).Scan(&state, &version, &aa, &ab)
	if e != nil {
		a.internal(w, e)
		return
	}
	submitted, _ := strconv.Atoi(r.FormValue("version"))
	if submitted != version {
		fail(w, 409, "L’accord a changé. Rechargez la page avant de confirmer.")
		return
	}
	action := r.PathValue("action")
	switch action {
	case "accepter":
		if state != "pending" {
			fail(w, 409, "Cet accord n’est pas en attente.")
			return
		}
		if u.EstID == x {
			aa = true
		} else {
			ab = true
		}
		if aa && ab {
			ok1, e := available(ctx, tx, x)
			if e != nil {
				a.internal(w, e)
				return
			}
			ok2, e := available(ctx, tx, y)
			if e != nil {
				a.internal(w, e)
				return
			}
			if !ok1 || !ok2 {
				fail(w, 409, ErrCapacity.Error())
				return
			}
			state = "active"
		}
		_, e = tx.ExecContext(ctx, `UPDATE partnerships SET accepted_a=$1,accepted_b=$2,status=$3,activated_at=CASE WHEN $3='active' THEN now() ELSE activated_at END WHERE id=$4`, aa, ab, state, id(r))
	case "modifier", "reactiver":
		terms := text(r, "terms", 10000)
		if action == "reactiver" {
			if state != "suspended" && state != "ended" {
				fail(w, 409, "Réactivation impossible pour ce statut.")
				return
			}
			e = tx.QueryRowContext(ctx, `SELECT terms FROM partnership_versions WHERE partnership_id=$1 AND version=$2`, id(r), version).Scan(&terms)
			if e != nil {
				a.internal(w, e)
				return
			}
		}
		if terms == "" {
			fail(w, 400, "Conditions obligatoires.")
			return
		}
		version++
		_, e = tx.ExecContext(ctx, `INSERT INTO partnership_versions(partnership_id,version,terms,author_id) VALUES($1,$2,$3,$4)`, id(r), version, terms, u.ID)
		if e == nil {
			_, e = tx.ExecContext(ctx, `UPDATE partnerships SET version=$1,status='pending',accepted_a=$2,accepted_b=$3 WHERE id=$4`, version, u.EstID == x, u.EstID == y, id(r))
		}
	case "terminer":
		_, e = tx.ExecContext(ctx, `UPDATE partnerships SET status='ended',accepted_a=false,accepted_b=false WHERE id=$1`, id(r))
	case "conserver":
		if state != "active" {
			fail(w, 409, "Seul un accord actif peut être conservé.")
			return
		}
		_, e = tx.ExecContext(ctx, `INSERT INTO retained_partnerships VALUES($1,$2) ON CONFLICT DO NOTHING`, u.EstID, id(r))
	case "deprioriser":
		_, e = tx.ExecContext(ctx, `DELETE FROM retained_partnerships WHERE establishment_id=$1 AND partnership_id=$2`, u.EstID, id(r))
	default:
		fail(w, 404, "Action inconnue.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	if _, e = tx.ExecContext(ctx, `INSERT INTO audit(user_id,action,entity_id) VALUES($1,$2,$3)`, u.ID, "partnership:"+action, id(r)); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, "/partenariats")
}

// reconcile serializes with activations by locking establishments in ascending order.
// It runs from the background worker and before capacity-sensitive requests.
func (a *App) reconcile(ctx context.Context) error {
	tx, e := a.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	rows, e := tx.QueryContext(ctx, `SELECT id FROM establishments ORDER BY id FOR UPDATE`)
	if e != nil {
		return e
	}
	var ids []int64
	for rows.Next() {
		var eid int64
		if e = rows.Scan(&eid); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, eid)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, eid := range ids {
		var capacity int
		var unlimited bool
		if e = tx.QueryRowContext(ctx, `SELECT 2+purchased_slots,COALESCE(subscription_until>now(),false) FROM establishments WHERE id=$1`, eid).Scan(&capacity, &unlimited); e != nil {
			return e
		}
		if unlimited {
			continue
		}
		rs, e := tx.QueryContext(ctx, `SELECT p.id FROM partnerships p LEFT JOIN retained_partnerships r ON r.partnership_id=p.id AND r.establishment_id=$1 WHERE p.status='active' AND (p.a=$1 OR p.b=$1) ORDER BY (r.partnership_id IS NOT NULL) DESC,p.activated_at,p.id`, eid)
		if e != nil {
			return e
		}
		var overflow []int64
		n := 0
		for rs.Next() {
			var pid int64
			if e = rs.Scan(&pid); e != nil {
				rs.Close()
				return e
			}
			if n >= capacity {
				overflow = append(overflow, pid)
			}
			n++
		}
		e = rs.Err()
		rs.Close()
		if e != nil {
			return e
		}
		for _, pid := range overflow {
			if _, e = tx.ExecContext(ctx, `UPDATE partnerships SET status='suspended',accepted_a=false,accepted_b=false WHERE id=$1`, pid); e != nil {
				return e
			}
		}
	}
	return tx.Commit()
}
func (a *App) Worker(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			job, cancel := context.WithTimeout(ctx, 30*time.Second)
			if e := a.reconcile(job); e != nil { /* requests will retry reconciliation; do not hide errors in main logs */
				fmtLog(e)
			}
			_, e := a.DB.ExecContext(job, `DELETE FROM sessions WHERE expires_at<now(); DELETE FROM tokens WHERE expires_at<now()`)
			if e != nil {
				fmtLog(e)
			}
			cancel()
		}
	}
}
func (a *App) offers(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "offers", Title: "Un réseau à votre mesure"}
	e := a.DB.QueryRowContext(r.Context(), `SELECT 2+purchased_slots,COALESCE(subscription_until>now(),false),(SELECT count(*) FROM partnerships WHERE status='active' AND (a=$1 OR b=$1)) FROM establishments WHERE id=$1`, user(r).EstID).Scan(&p.Slots, &p.Unlimited, &p.Active)
	if e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, p)
}
func (a *App) history(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "history", Title: "Historique des conditions"}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT v.version,v.terms,u.name,to_char(v.created_at,'DD/MM/YYYY HH24:MI') FROM partnership_versions v JOIN partnerships p ON p.id=v.partnership_id JOIN users u ON u.id=v.author_id WHERE p.id=$1 AND (p.a=$2 OR p.b=$2) ORDER BY v.version DESC`, id(r), user(r).EstID)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.Version, &i.Terms, &i.Name, &i.Date); e != nil {
			a.internal(w, e)
			return
		}
		p.Items = append(p.Items, i)
	}
	if e = rows.Err(); e != nil {
		a.internal(w, e)
		return
	}
	if len(p.Items) == 0 {
		fail(w, 404, "Accord introuvable.")
		return
	}
	a.render(w, r, p)
}
