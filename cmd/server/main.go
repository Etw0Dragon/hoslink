package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"plateforme-partenaires/internal/app"
	"plateforme-partenaires/internal/store"
	"syscall"
	"time"
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func main() {
	if e := run(); e != nil {
		slog.Error("server stopped", "error", e)
		os.Exit(1)
	}
}
func run() error {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return errors.New("DATABASE_URL est obligatoire ; voir .env.example")
	}
	startup, done := context.WithTimeout(ctx, 20*time.Second)
	defer done()
	db, e := store.Open(startup, url)
	if e != nil {
		return e
	}
	defer db.Close()
	if e = store.Migrate(startup, db); e != nil {
		return e
	}
	c := app.Config{BaseURL: env("BASE_URL", "http://localhost:8080"), Address: env("ADDR", "127.0.0.1:8080"), Production: os.Getenv("APP_ENV") == "production", MailDir: env("MAIL_DIR", "var/mail"), SMTPAddr: os.Getenv("SMTP_ADDR"), SMTPUser: os.Getenv("SMTP_USER"), SMTPPassword: os.Getenv("SMTP_PASSWORD"), MailFrom: env("MAIL_FROM", "noreply@localhost")}
	a, e := app.New(db, c)
	if e != nil {
		return e
	}
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		slog.Info("migrations applied")
		return nil
	}
	if len(os.Args) > 2 && os.Args[1] == "admin" {
		res, e := db.ExecContext(ctx, `UPDATE users SET admin=true WHERE email=$1 AND verified=true`, os.Args[2])
		if e != nil {
			return e
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			return errors.New("compte vérifié introuvable")
		}
		slog.Info("administrator enabled")
		return nil
	}
	srv := &http.Server{Addr: c.Address, Handler: a.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	go a.Worker(ctx)
	stopped := make(chan error, 1)
	go func() { slog.Info("Hoslink", "url", c.BaseURL); stopped <- srv.ListenAndServe() }()
	select {
	case e := <-stopped:
		if errors.Is(e, http.ErrServerClosed) {
			return nil
		}
		return e
	case <-ctx.Done():
		shutdown, finish := context.WithTimeout(context.Background(), 10*time.Second)
		defer finish()
		return srv.Shutdown(shutdown)
	}
}
