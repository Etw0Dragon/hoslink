package app

import "net/http"

// dashboard uses only the current establishment's private activity. Discovery is
// drawn from approved profiles; it is not a personalized recommendation score.
func (a *App) dashboard(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "dashboard", Title: "Tableau de bord"}
	eid := user(r).EstID
	err := a.DB.QueryRowContext(r.Context(), `SELECT
 (SELECT count(*) FROM partnerships WHERE (a=$1 OR b=$1) AND status='active'),
 (SELECT count(*) FROM partnerships WHERE (a=$1 OR b=$1) AND status='pending' AND NOT CASE WHEN a=$1 THEN accepted_a ELSE accepted_b END),
 2+purchased_slots,COALESCE(subscription_until>now(),false)
 FROM establishments WHERE id=$1`, eid).Scan(&p.Active, &p.Pending, &p.Slots, &p.Unlimited)
	if err != nil {
		a.internal(w, err)
		return
	}
	rows, err := a.DB.QueryContext(r.Context(), `SELECT c.id,e.name,c.subject,c.quote,to_char(latest.at,'DD/MM/YYYY HH24:MI')
 FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$1 THEN c.b ELSE c.a END
 CROSS JOIN LATERAL (SELECT COALESCE(max(m.created_at),c.created_at) AS at FROM messages m WHERE m.conversation_id=c.id) latest
 WHERE c.a=$1 OR c.b=$1 ORDER BY latest.at DESC,c.id DESC LIMIT 4`, eid)
	if err != nil {
		a.internal(w, err)
		return
	}
	for rows.Next() {
		var i Item
		if err = rows.Scan(&i.ID, &i.Name, &i.Subject, &i.Quote, &i.Date); err != nil {
			rows.Close()
			a.internal(w, err)
			return
		}
		p.Messages = append(p.Messages, i)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		a.internal(w, err)
		return
	}
	rows, err = a.DB.QueryContext(r.Context(), `SELECT id,name,category,station,city,description FROM establishments WHERE status='approved' AND id<>$1 ORDER BY created_at DESC,id DESC LIMIT 3`, eid)
	if err != nil {
		a.internal(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if err = rows.Scan(&i.ID, &i.Name, &i.Category, &i.Station, &i.City, &i.Description); err != nil {
			a.internal(w, err)
			return
		}
		p.Items = append(p.Items, i)
	}
	if err = rows.Err(); err != nil {
		a.internal(w, err)
		return
	}
	a.render(w, r, p)
}
