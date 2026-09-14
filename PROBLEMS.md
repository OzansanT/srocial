# Srocial Problems Tracker

This file is the canonical tracker for unresolved problems, half-finished work, blocked work, verification gaps, and known technical debt discovered during Srocial development.

It is **not** a replacement for the product roadmap. Future features belong in the roadmap/README. An item belongs here when development has exposed something that is incomplete, unverified, intentionally deferred after partial implementation, or likely to cause incorrect/unsafe behavior if forgotten.

## Status Rules

Use these states:

- `OPEN` — confirmed unresolved.
- `PARTIAL` — implemented only partly or missing an important path.
- `BLOCKED` — cannot currently be completed because an external dependency, credential, environment, or provider capability is missing.
- `VERIFY` — implementation exists but the required real-world/browser/integration verification is still missing.
- `RESOLVED` — fixed **and verified**. Keep resolved entries in the history section instead of deleting them immediately.

Use these priorities:

- `P0` — security/data-loss/duplicate external side-effect risk; fix before further dependent work.
- `P1` — important correctness or production-readiness gap.
- `P2` — significant incomplete capability or operational gap.
- `P3` — lower-risk debt, maintenance, or test-hardening item.

## Active Problems

| ID | Priority | Status | Problem | Evidence / Why it remains open | Required resolution |
| --- | --- | --- | --- | --- | --- |
| SR-P001 | P1 | VERIFY | Browser end-to-end interaction coverage is still missing. | Current CI verifies Node tests, PostgreSQL migrations, and JavaScript syntax, but there is no browser/E2E suite in the repository. | Add browser-level tests for critical operator flows such as login, account connect/reconnect/disconnect UI state, media upload/library use, composer scheduling, validation errors, queue actions, and logout. |
| SR-P002 | P1 | VERIFY | TikTok V15 is implemented and deterministically tested but has not completed a real developer-app publishing verification. | V15 now includes TikTok OAuth, encrypted/rotating token handling, account binding, Creator Info, Direct Post for photo/video, provider-options persistence, status normalization, UI controls, tests, and operator documentation. Repository CI cannot supply a real TikTok developer app, approved scopes, verified media URL prefix, or publishing account. | With real TikTok credentials, verify OAuth -> account identity -> Creator Info -> Direct Post -> status completion using a verified production media domain/prefix; record provider/API evidence before marking resolved. |
| SR-P003 | P1 | OPEN | Real provider webhook processing and provider-health/rate-limit visibility are not implemented. | README development direction lists these after the TikTok provider milestone. Existing architecture has webhook concepts/data structures, but real provider webhook/status operational coverage is incomplete. | Implement verified provider webhook ingestion/deduplication, health state, rate-limit state/visibility, tests, and safe operational UI/API reporting. |
| SR-P004 | P2 | OPEN | WhatsApp Business messaging/campaign subsystem is still planned rather than implemented. | WhatsApp Business remains a planned separate subsystem. | Implement contacts, consent/eligibility, templates, campaigns, recipient-level message state/delivery tracking, webhook handling, retries, tests, and UI. |
| SR-P005 | P2 | OPEN | Calendar/queue operational controls and lifecycle controls are incomplete. | Calendar/queue controls, drafts, edit/cancel/retry controls, and analytics remain future development. | Implement the missing operator workflows with state-safe backend APIs, UI, authorization, persistence, and tests. |
| SR-P006 | P3 | PARTIAL | Production authentication remains intentionally single-administrator and rate limiting is process-local. | Database-backed users, RBAC, invitations, password reset, external identity providers, session revocation, proxy-aware/distributed rate limiting are not part of the current implementation. Current limiter is process-local and deliberately ignores forwarded IP headers. | If Srocial becomes multi-user or multi-instance, design a separate security milestone for identities/RBAC/session revocation/trusted-proxy handling/shared rate limiting. Until then, keep deployment assumptions explicit. |
| SR-P007 | P2 | PARTIAL | Legacy platform-only scheduling can still create unbound publications. | Legacy platform-only scheduling still creates unbound publications by design for backward compatibility. Account-bound scheduling is the preferred path. | Decide whether backward compatibility is still required. If not, migrate callers/data and remove unbound publication creation; otherwise keep it explicitly isolated and tested. |

## Mandatory Update Procedure

For every development task:

1. Read this file before coding.
2. Check whether the requested work is affected by any active problem above.
3. During development, add any newly discovered unresolved defect, incomplete path, blocked verification, or technical debt that should not be forgotten.
4. Do **not** mark an item `RESOLVED` merely because code was written.
5. To resolve an item, record the concrete verification evidence: tests, CI run, browser/E2E verification, migration test, real provider/Testnet verification, or another appropriate check.
6. If work finishes only partially, keep the item `PARTIAL` and state exactly what remains.
7. If an external credential/provider/environment prevents verification, use `BLOCKED` or `VERIFY`; do not silently treat the work as complete.
8. At the end of every development task, review this file again and report any active item that became more urgent because of the change.

## Entry Template

```md
| SR-P### | P0/P1/P2/P3 | OPEN/PARTIAL/BLOCKED/VERIFY | Short problem statement | Evidence and why it is unresolved | Exact condition required to resolve it |
```

## Resolution History

Move entries here only after the required resolution evidence exists.

| ID | Resolved date | Resolution | Verification evidence |
| --- | --- | --- | --- |
| SR-P008 | 2026-09-14 | Restored the canonical problem tracker after commit `c8e443a` reduced `PROBLEMS.md` to an empty file despite Rule 41 in `updaterules.md`. | V15 branch restores the tracker content and keeps unresolved work explicit before merge. |
