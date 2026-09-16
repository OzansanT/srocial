# V29 — Operational Health & Environment Diagnostics

V29 completes the source roadmap's operational-health block, items **16–20**, by extending the existing protected Operations Center instead of creating a second diagnostics system.

## Source-roadmap mapping

| Source item | V29 state |
| --- | --- |
| 16. Database health check | Existing repository `healthCheck()` and public minimal `/api/health` are retained; the same sanitized repository health is also shown inside Operations. |
| 17. Storage health check | Added local-filesystem and S3-compatible writeability probes. |
| 18. Scheduler health indicator | Added runtime-only scheduler status and tick telemetry. |
| 19. Provider health indicator | Existing V16 provider health/rate-limit telemetry is preserved and remains visible in Operations. |
| 20. Environment diagnostic page | Added a secret-safe environment/configuration diagnostic section inside Operations. |

## Runtime health contract

`GET /api/operations` remains protected by the existing application authentication/RBAC boundary and now returns the existing provider/job/attempt/webhook summaries plus:

```json
{
  "runtime": {
    "database": {},
    "storage": {},
    "scheduler": {}
  },
  "environment": {
    "ok": true,
    "issues": []
  }
}
```

A failure in one infrastructure probe degrades only that probe's result. It does not discard the existing Operations summaries or expose the caught exception text.

The public `/api/health` route remains intentionally minimal and database-oriented; detailed deployment diagnostics stay on the protected Operations surface.

## Database health

V29 reuses the existing repository health contract instead of adding a second connectivity implementation.

The protected Operations payload exposes only:

- `ok`
- a normalized backend (`json`, `postgres`, or `unavailable`)

Connection strings, query text, raw driver errors, hosts, users, passwords, and other database details are not returned.

## Storage health

Both supported media stores now implement `healthCheck()`.

### Local filesystem

The local store:

1. ensures the configured upload directory is accessible;
2. creates a tiny health probe file;
3. removes the probe file;
4. returns a normalized local-storage health result.

Permission/read-only/access failures are normalized to safe error codes. Filesystem paths and raw operating-system error text are not returned through Operations.

### S3-compatible storage

The S3 store uses a reserved `__srocial-health__/...` object key and verifies both sides of the write contract:

1. PUT a tiny probe object;
2. DELETE the probe object;
3. report healthy only when the write/cleanup sequence succeeds.

The probe does not expose the endpoint, bucket, access key, secret key, authorization headers, or raw object-store response bodies.

## Scheduler health

`startSchedulerLoop()` now exposes a read-only `status()` snapshot without changing scheduler dispatch semantics.

The status contains only:

- `configured`
- `running`
- `stopped`
- `inFlight`
- `intervalMs`
- `lastTickStartedAt`
- `lastSuccessfulTickAt`
- `lastFailedTickAt`
- `lastErrorCode`

The telemetry is process-local and runtime-only. V29 does not add a second scheduler, persist scheduler-health records, change execution gates, alter job claiming, modify retry/backoff, or allow overlapping ticks.

Disabled execution still remains the default:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

## Environment diagnostics

`server/operations/environment-diagnostics.js` evaluates the supplied environment and emits only static diagnostic metadata:

```json
{
  "ok": false,
  "issues": [
    {
      "code": "...",
      "severity": "error",
      "setting": "SETTING_NAME",
      "message": "..."
    }
  ]
}
```

No setting value is copied to the output.

Current checks cover:

- PostgreSQL selected without `DATABASE_URL`;
- S3 selected without its required endpoint/bucket/credentials/public-base configuration;
- partially configured Instagram, Facebook, Threads, TikTok, or WhatsApp credentials;
- scheduler enabled with no real-execution gate;
- real-execution gate enabled while the scheduler is disabled;
- externally reachable real execution using HTTP instead of HTTPS;
- externally reachable real execution while application authentication is disabled;
- enabled application authentication without the required administrator password or session secret.

Completely absent optional provider credentials stay quiet. Diagnostics identify setting **names**, not values.

## Operations UI

The existing Operations page now adds:

- **Runtime health** — Database, Storage, Scheduler;
- **Environment diagnostics** — configuration errors/warnings, or an explicit clean state.

The page keeps the existing Provider Health, Failed / Retrying Jobs, Publication Attempts, and Verified Webhook Events sections.

Rendering uses DOM creation and `textContent`; V29 does not introduce `innerHTML` rendering for diagnostic content.

## TDD and verification evidence

V29 was built in isolated RED → GREEN slices:

- Storage health: RED added four missing-probe tests; GREEN workflow `35085316694` passed migrations, **484/484 Node tests**, JavaScript syntax, and **14/14 Chrome E2E**.
- Scheduler health: RED reached **484/487** with only the three new status-contract tests failing; GREEN workflow `35085647512` passed the complete pipeline.
- Environment diagnostics: RED workflow `35087134749` reached **487/488**, failing only because the diagnostics module was intentionally absent; GREEN workflow `35087353911` passed the complete pipeline.
- Operations composition: RED workflow `35087483904` reached **493/495**, failing only the two new runtime-composition assertions; GREEN workflow `35087742924` passed migrations, **495/495 Node tests**, syntax, and **14/14 Chrome E2E**.
- Runtime wiring + Operations UI: workflow `35088108989` passed migrations `001–010`, **495/495 Node tests**, JavaScript syntax, and **15/15 real Chrome/CDP scenarios**, including the new browser scenario that verifies Database, Storage, Scheduler, and Environment diagnostics through the real spawned server.

A fresh exact-final-head workflow is still required after documentation reconciliation before PR #32 is eligible to merge.

## Scope boundaries

V29 performs no live provider publishing, webhook delivery, analytics permission check, or WhatsApp Cloud API send. The existing externally blocked verification items in `PROBLEMS.md` therefore remain open.

V29 also does not expose secrets, diagnose by returning raw environment values, or make public detailed infrastructure status beyond the existing minimal `/api/health` response.
