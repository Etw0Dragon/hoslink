# Charge les variables locales pour Go et Docker Compose.
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: run test test-integration build db fmt
run:
	go run ./cmd/server
test:
	go test -race ./...
build:
	mkdir -p bin
	go build -buildvcs=false -trimpath -o bin/partenaires ./cmd/server
db:
	docker compose up -d --wait db
	docker compose exec -T db psql -v ON_ERROR_STOP=1 -U partenaires -d postgres < scripts/create-test-db.sql
fmt:
	gofmt -w cmd internal web public

test-integration:
	go test -race ./internal/app -run Integration -v

# Sortie statique uniquement ; aucun serveur ou accès PostgreSQL.
.PHONY: preview preview-test
PAGES_BASE_PATH ?= /hoslink
PAGES_OUT ?= dist
preview:
	go run ./cmd/preview -out "$(PAGES_OUT)" -base-path "$(PAGES_BASE_PATH)"
preview-test:
	go test ./internal/preview ./web
