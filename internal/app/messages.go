package app

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

func (a *App) conversations(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "conversations", Title: "Vos échanges"}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT c.id,c.subject,c.quote,e.name,to_char(c.created_at,'DD/MM/YYYY') FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$1 THEN c.b ELSE c.a END WHERE c.a=$1 OR c.b=$1 ORDER BY c.id DESC LIMIT 100`, user(r).EstID)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.Subject, &i.Quote, &i.Name, &i.Date); e != nil {
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
func pair(a, b int64) (int64, int64) {
	if a > b {
		return b, a
	}
	return a, b
}
func (a *App) startConversation(w http.ResponseWriter, r *http.Request) {
	other, _ := strconv.ParseInt(r.FormValue("other"), 10, 64)
	u := user(r)
	subject := text(r, "subject", 160)
	body := text(r, "body", 10000)
	if other <= 0 || other == u.EstID || subject == "" || body == "" {
		fail(w, 400, "Destinataire, objet et message obligatoires.")
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var approved bool
	e = tx.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM establishments WHERE id=$1 AND status='approved')`, other).Scan(&approved)
	if e != nil {
		a.internal(w, e)
		return
	}
	if !approved {
		fail(w, 404, "Destinataire inaccessible.")
		return
	}
	x, y := pair(u.EstID, other)
	var cid int64
	e = tx.QueryRowContext(r.Context(), `INSERT INTO conversations(a,b,subject,quote) VALUES($1,$2,$3,$4) RETURNING id`, x, y, subject, r.FormValue("quote") == "1").Scan(&cid)
	if e != nil {
		a.internal(w, e)
		return
	}
	if _, e = tx.ExecContext(r.Context(), `INSERT INTO messages(conversation_id,sender_id,establishment_id,body) VALUES($1,$2,$3,$4)`, cid, u.ID, u.EstID, body); e != nil {
		a.internal(w, e)
		return
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, fmt.Sprintf("/messages/%d", cid))
}
func (a *App) conversation(w http.ResponseWriter, r *http.Request) {
	p := Page{Page: "conversation", Title: "Conversation"}
	u := user(r)
	e := a.DB.QueryRowContext(r.Context(), `SELECT c.id,c.subject,c.quote,e.name FROM conversations c JOIN establishments e ON e.id=CASE WHEN c.a=$2 THEN c.b ELSE c.a END WHERE c.id=$1 AND (c.a=$2 OR c.b=$2)`, id(r), u.EstID).Scan(&p.Item.ID, &p.Item.Subject, &p.Item.Quote, &p.Item.Name)
	if e == sql.ErrNoRows {
		fail(w, 404, "Conversation introuvable.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	rows, e := a.DB.QueryContext(r.Context(), `SELECT m.id,e.name,m.body,to_char(m.created_at,'DD/MM/YYYY HH24:MI'),COALESCE(d.id,0),COALESCE(d.name,'') FROM messages m JOIN establishments e ON e.id=m.establishment_id LEFT JOIN attachments d ON d.message_id=m.id WHERE m.conversation_id=$1 ORDER BY m.id LIMIT 500`, id(r))
	if e != nil {
		a.internal(w, e)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var i Item
		if e = rows.Scan(&i.ID, &i.Name, &i.Body, &i.Date, &i.OtherID, &i.FileName); e != nil {
			a.internal(w, e)
			return
		}
		p.Messages = append(p.Messages, i)
	}
	if e = rows.Err(); e != nil {
		a.internal(w, e)
		return
	}
	a.render(w, r, p)
}
func validPDF(b []byte) bool {
	return len(b) > 8 && len(b) <= 5<<20 && strings.HasPrefix(string(b[:5]), "%PDF-") && strings.Contains(string(b[max(0, len(b)-1024):]), "%%EOF")
}
func (a *App) sendMessage(w http.ResponseWriter, r *http.Request) {
	body := text(r, "body", 10000)
	var data []byte
	var filename string
	f, h, e := r.FormFile("document")
	if e == nil {
		defer f.Close()
		data, e = io.ReadAll(io.LimitReader(f, (5<<20)+1))
		if e != nil {
			a.internal(w, e)
			return
		}
		if !validPDF(data) {
			fail(w, 400, "Document PDF invalide ou supérieur à 5 Mo.")
			return
		}
		filename = strings.Map(func(c rune) rune {
			if c == '\r' || c == '\n' || c == '/' || c == '\\' || c == '"' {
				return '_'
			}
			return c
		}, h.Filename)
		if len(filename) > 180 {
			filename = "devis.pdf"
		}
	} else if e != http.ErrMissingFile && e != http.ErrNotMultipart {
		fail(w, 400, "Pièce jointe invalide.")
		return
	}
	if body == "" && len(data) == 0 {
		fail(w, 400, "Ajoutez un message ou un PDF.")
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		a.internal(w, e)
		return
	}
	defer tx.Rollback()
	var mid int64
	e = tx.QueryRowContext(r.Context(), `INSERT INTO messages(conversation_id,sender_id,establishment_id,body) SELECT id,$2,$3,$4 FROM conversations WHERE id=$1 AND (a=$3 OR b=$3) RETURNING id`, id(r), user(r).ID, user(r).EstID, body).Scan(&mid)
	if e == sql.ErrNoRows {
		fail(w, 404, "Conversation introuvable.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	if len(data) > 0 {
		if _, e = tx.ExecContext(r.Context(), `INSERT INTO attachments(message_id,name,data) VALUES($1,$2,$3)`, mid, filename, data); e != nil {
			a.internal(w, e)
			return
		}
	}
	if e = tx.Commit(); e != nil {
		a.internal(w, e)
		return
	}
	redirect(w, r, fmt.Sprintf("/messages/%d", id(r)))
}
func (a *App) download(w http.ResponseWriter, r *http.Request) {
	var name string
	var data []byte
	e := a.DB.QueryRowContext(r.Context(), `SELECT d.name,d.data FROM attachments d JOIN messages m ON m.id=d.message_id JOIN conversations c ON c.id=m.conversation_id WHERE d.id=$1 AND (c.a=$2 OR c.b=$2)`, id(r), user(r).EstID).Scan(&name, &data)
	if e == sql.ErrNoRows {
		fail(w, 404, "Document introuvable.")
		return
	}
	if e != nil {
		a.internal(w, e)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}
