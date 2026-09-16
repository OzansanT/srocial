# V29 — Operational Health & Environment Diagnostics Design

## Source basis

The supplied feature source defines the P0 production-health block as:

- **#16 Database health check** — surface database connectivity on the dashboard.
- **#17 Storage health check** — detect inaccessible or read-only media storage.
- **#18 Scheduler health indicator** — running/stopped/last successful tick.
- **#19 Provider health indicator** — connection/API status per provider.
- **#20 Environment diagnostic page** — identify missing configuration without displaying secrets.

The same source orders production work as `database → transactional claims → migrations → backup/restore → health checks`.

V28 closed source items #14–15. V29 reconciles #16–20 against existing implementation before adding code:

- database connectivity health already exists through repository `healthCheck()` and public `/api/health`;
- provider health already exists in the protected Operations Center;
- storage writeability health, scheduler runtime health, and secret-safe environment diagnostics remain missing.

V29 therefore extends the existing Operations Center. It does not create a second health subsystem or replace the public liveness endpoint.

## Goals

1. Surface database, media storage, scheduler, and existing provider health together in the protected Operations Center.
2. Detect inaccessible or read-only local/S3 media storage without exposing storage credentials or endpoints.
3. Expose scheduler running/stopped/in-flight state and last successful/failed tick timestamps without creating persistent scheduler telemetry.
4. Report missing or inconsistent environment configuration by **setting name/code only**, never by secret value.
5. Preserve the current public `/api/health` information boundary and current provider telemetry behavior.
6. Keep all diagnostics bounded and safe to refresh from the Operations page.

## Non-goals

V29 does not:

- replace infrastructure monitoring;
- perform live social-provider publishing as a health probe;
- resolve the live-provider verification items in `PROBLEMS.md`;
- expose database URLs, S3 endpoints, tokens, passwords, app secrets, access keys, session secrets, or encryption keys;
- persist scheduler health into PostgreSQL/JSON;
- create a background health-monitor worker;
- add destructive repair buttons.

## Runtime architecture

```text
Protected Operations page
        |
        v
GET /api/operations
        |
        +--> existing provider/attempt/webhook summaries
        |
        +--> Runtime diagnostics
        |      +--> repository.healthCheck()
        |      +--> mediaStore.healthCheck()
        |      `--> schedulerLoop.status()
        |
        `--> Environment diagnostics
               `--> diagnoseEnvironment(process.env)
```

The public `/api/health` remains database-oriented and sanitized. Rich diagnostics are protected by the existing Operations authorization boundary.

## Storage health

Both media-store implementations gain the same `healthCheck()` contract:

```js
{
  ok: boolean,
  backend: 'local' | 's3',
  writable: boolean,
  errorCode: string | null
}
```

### Local storage

The local probe:

1. ensures the configured media root exists;
2. creates a tiny uniquely named probe file using exclusive creation;
3. closes/removes it in `finally`;
4. returns only the sanitized backend/writable result.

This proves both accessibility and writeability and leaves no managed media record.

### S3-compatible storage

The S3 probe uses a reserved object key outside Srocial's generated media-key pattern, such as `__srocial-health__/probe-<uuid>`. It performs a zero-byte/tiny-object PUT followed by DELETE through the existing signed request client.

The reserved prefix is outside normal generated media keys, so ordinary Media Library listing ignores it. Cleanup is attempted in `finally`. Returned diagnostics never include endpoint, bucket, key id, request body, provider response body, or signed URL.

Failures map to one safe code such as `MEDIA_STORAGE_UNAVAILABLE` or `MEDIA_STORAGE_READ_ONLY`; the exact raw object-store error is not returned to the browser.

## Scheduler health

`startSchedulerLoop()` retains its existing `started` and `stop()` surface and adds a `status()` method. The status object is runtime-only:

```js
{
  configured: boolean,
  running: boolean,
  stopped: boolean,
  inFlight: boolean,
  intervalMs: number,
  lastTickStartedAt: string | null,
  lastSuccessfulTickAt: string | null,
  lastFailedTickAt: string | null,
  lastErrorCode: string | null
}
```

Behavior:

- when scheduler/execution gates keep the loop disabled, `configured` reflects the scheduler flag while `running=false`;
- starting a tick sets `inFlight=true` and `lastTickStartedAt`;
- successful completion sets `lastSuccessfulTickAt` and clears `lastErrorCode`;
- failure sets `lastFailedTickAt` and a safe error code while preserving the existing sanitized logger call;
- overlapping callbacks remain skipped;
- `stop()` sets stopped/running state consistently.

A `now` dependency is injected for deterministic tests; production defaults to `new Date()`.

## Environment diagnostics

A new pure module, `server/operations/environment-diagnostics.js`, accepts an environment-like object and returns only safe metadata:

```js
{
  ok: boolean,
  issues: [
    {
      code: 'DATABASE_URL_REQUIRED',
      severity: 'error' | 'warning',
      setting: 'DATABASE_URL',
      message: '...'
    }
  ]
}
```

No diagnostic contains a setting value.

The initial rules stay deliberately bounded to current runtime contracts:

- `DATABASE_DRIVER=postgres` requires `DATABASE_URL`;
- `MEDIA_STORAGE_DRIVER=s3` requires the existing S3 configuration set;
- provider credential pairs are reported when only one side is configured;
- TikTok client-key/client-secret pairing is checked;
- WhatsApp configuration is reported when partially configured;
- `SCHEDULER_ENABLED=true` with neither real social nor WhatsApp execution gate enabled is a warning;
- enabling a real execution gate while `SCHEDULER_ENABLED` is false is a warning;
- real external execution with a non-HTTPS/non-loopback `PUBLIC_BASE_URL` is an error/warning consistent with existing deployment rules;
- auth-enabled environments report missing required auth setting names without values.

Optional providers that are completely absent do not make diagnostics unhealthy.

The module does not replace startup validation. Startup parsers remain authoritative; diagnostics are an operator explanation layer.

## Operations service and route

The existing Operations summary gains two top-level keys while preserving current keys:

```js
{
  providers,
  failedJobs,
  attempts,
  webhooks,
  runtime: {
    database,
    storage,
    scheduler
  },
  environment: {
    ok,
    issues
  }
}
```

Database/storage probe failures are converted into sanitized `ok:false` objects instead of failing the complete Operations request. Existing provider/job/attempt/webhook rendering therefore remains available during an infrastructure problem.

`getOperationsPayload()` receives an explicit dependency object rather than reading global state itself. `createRequestHandler()` is passed runtime diagnostic dependencies from `server/server.js`.

## UI

The current Operations page gains:

- **Runtime Health** cards/list for Database, Media Storage, and Scheduler;
- **Environment Diagnostics** list showing safe issue code, setting name, severity, and explanation;
- existing Provider Health, Failed Jobs, Publication Attempts, and Webhook Events remain unchanged.

Rendering continues to use DOM APIs and `textContent`; no `innerHTML` is introduced.

## Security and privacy

1. Rich diagnostics remain behind application authentication/RBAC because `/api/operations` is already protected.
2. Public `/api/health` is not expanded with environment/provider/storage configuration details.
3. Environment diagnostics expose setting **names only**.
4. Storage errors are normalized; raw S3/local filesystem errors are not sent to clients.
5. Scheduler telemetry contains no worker credentials, provider tokens, payloads, or job content.
6. Health probes never publish to social networks or send WhatsApp messages.

## Testing strategy

TDD coverage will include:

1. local media health success, read-only/unavailable failure sanitization, and probe cleanup;
2. S3 health signed PUT/DELETE probe behavior and sanitized failure paths;
3. scheduler disabled/running/in-flight/success/failure/stopped status transitions with deterministic time;
4. environment diagnostics detect missing/partial current settings and prove secret values are absent from serialized output;
5. Operations API preserves existing summaries and adds database/storage/scheduler/environment diagnostics while degrading individual probes safely;
6. UI/static tests require new Runtime Health and Environment Diagnostics targets and safe rendering;
7. existing PostgreSQL, deterministic Node, syntax, and real Chrome/CDP CI remain mandatory.

## Documentation and roadmap reconciliation

V29 updates README current status/development direction and operator documentation so it no longer claims V27 is current or that no source-defined V28 exists. It records:

- V28 closed #14–15;
- V29 closes the remaining implementation gap across #16–20 by reusing existing database/provider health and adding storage/scheduler/environment diagnostics;
- live-provider verification tracker items remain unresolved external verification work.
