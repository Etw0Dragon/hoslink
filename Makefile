.PHONY: run build test test-integration db migrate
run:
	npm run dev
build:
	npm run build
test:
	npm test
test-integration:
	node --env-file=.env.node --import tsx --test tests/integration.test.ts
db:
	docker compose --env-file .env.node -f compose.yaml -f compose.dev.yaml up -d --wait db
migrate:
	npm run migrate
