# Contributing

## Branch and commit

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). One
logical change per PR.

## Before you push

```bash
make lint
make test
```

## Adding an API endpoint

1. Schema in `app/schemas/`, using `ApiModel` so it serialises camelCase.
2. SQL in `app/repositories/` — never in a service or endpoint.
3. Logic in `app/services/`.
4. Route in `app/api/v1/endpoints/`, wired in `router.py`, dependency in `deps.py`.
5. `make codegen` — CI fails if the committed client does not match the schema.
6. A test in `apps/api/tests/` that exercises the route, not the service.

## Touching the prefetch policy

The policy lives in exactly one place (`app/services/policy.py`) and its config is
served to the client in the plan response. Do not add a second copy of the maths
in TypeScript. If the client needs to rank, it ranks with the served config.

Any policy change needs a before/after on `daily_game_stat.p50_ttps_ms` and the
prefetch hit rate. "It feels faster" is not a result — the prototype's whole point
was that three of the five obvious tiers buy almost nothing.
