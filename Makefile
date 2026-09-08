.PHONY: help setup dev web api db-up db-down migrate codegen lint test clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup:      ## install all deps (node + python) and seed local env
	pnpm install
	uv sync --project apps/api
	uv sync --project tools/skin-baker
	test -f .env || cp .env.example .env

dev:        ## run web + api together
	pnpm dev

seed:       ## load the 30-game catalogue from the real bundle
	pnpm --filter @eog/api seed

bake:       ## classify -> bake -> publish the 30 skinned bundles locally
	pnpm --filter @eog/skin-baker classify -- --trace ../../prefetch-demo/report.jsonl
	pnpm --filter @eog/skin-baker bake
	pnpm --filter @eog/skin-baker publish:local

web:        ## next dev server only
	pnpm --filter @eog/web dev

api:        ## fastapi dev server only
	pnpm --filter @eog/api dev

db-up:      ## local postgres (skip if using Supabase directly)
	docker compose -f infra/docker/compose.dev.yml up -d

db-down:
	docker compose -f infra/docker/compose.dev.yml down

migrate:    ## apply alembic migrations
	pnpm db:migrate

codegen:    ## regenerate the typed API client from the live OpenAPI schema
	pnpm codegen

lint:
	pnpm lint && pnpm api:lint && pnpm --filter @eog/skin-baker lint

test:
	pnpm test && pnpm api:test && pnpm --filter @eog/skin-baker test

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules .turbo apps/web/.next
