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
| SR-P001 | P1 | VERIFY | Browser end-to-end interaction coverage is still missing. | Current CI verifies Node tests, PostgreSQL migrations, and JavaScript syntax, but there is no browser/E2E suite in the repository. | Add browser-level tests for critical operator flows such as login, account connect/reconnect/disconnect UI state, media upload/library use, composer scheduling, validation errors, queue/calendar lifecycle actions, WhatsApp operator workflows, Operations Center behavior, and logout. |
| SR-P002 | P1 | VERIFY | TikTok V15 is implemented and deterministically tested but has not completed a real developer-app publishing verification. | V15 includes TikTok OAuth, encrypted/rotating token handling, account binding, Creator Info, Direct Post for photo/video, provider-options persistence, status normalization, UI controls, tests, and operator documentation. Repository CI cannot supply a real TikTok developer app, approved scopes, verified media URL prefix, or publishing account. | With real TikTok credentials, verify OAuth -> account identity -> Creator Info -> Direct Post -> status completion using a verified production media domain/prefix; record provider/API evidence before marking resolved. |
| SR-P003 | P1 | VERIFY | V16 provider webhook processing and provider-health/rate-limit visibility are implemented but not verified against live provider delivery. | V16 adds raw-body Meta/TikTok signature verification, replay-age protection for TikTok, webhook persistence/deduplication, TikTok publication/account synchronization, publication-attempt history, provider health/rate-limit snapshots, protected Operations API, dashboard UI, deterministic tests, and PostgreSQL migration coverage. CI cannot originate signed deliveries from approved real provider apps or validate public HTTPS callback configuration. | With approved Meta/TikTok apps and public HTTPS callbacks, verify Meta challenge + signed delivery and TikTok signed Content Posting delivery end to end, including duplicate delivery behavior and Operations Center state; record provider evidence before marking resolved. |
| SR-P004 | P1 | VERIFY | V17 WhatsApp Business is implemented and deterministically tested but has not completed a real Cloud API campaign verification. | V17 now includes E.164 contacts, explicit consent/eligibility, approved-template sync, scheduled campaigns, recipient/message persistence, an independently gated `WHATSAPP_CAMPAIGN` scheduler path, rate-limit retry, duplicate-send-safe `DELIVERY_UNCERTAIN` handling, signed webhook processing, delivery/read/failure synchronization, Operations telemetry, management APIs/UI, JSON/PostgreSQL parity, and migration 006. CI has no approved WhatsApp Business account, production token/sender, approved template, or public HTTPS callback. | With real WhatsApp Business credentials, verify template sync -> opted-in contact -> scheduled send -> provider message ID -> signed sent/delivered/read or failed webhook -> persisted recipient/message state -> Operations Center telemetry. Record real-provider evidence before marking resolved. |
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
| SR-P009 | 2026-09-14 | Replaced sequential social/WhatsApp scheduling writes with repository-level all-or-nothing graph persistence and added atomic lifecycle mutation units for JSON/PostgreSQL. | V18 GitHub Actions run `34847163782`: PostgreSQL transaction rollback tests, JSON failure-injection rollback tests, 381/381 tests passed, migrations and syntax checks green. |
| SR-P005 | 2026-09-14 | Implemented the source-defined Calendar/Queue lifecycle controls: month/week/day calendar, drag reschedule, queue filters, edit/reschedule/cancel/duplicate/retry, bulk reschedule/cancel, protected APIs, and shared browser state. | V18 GitHub Actions run `34847163782`: lifecycle service/API/calendar/UI contract tests passed within 381/381 tests; PostgreSQL migrations and JavaScript syntax checks green. Browser E2E remains separately tracked under `SR-P001`. |
| SR-P008 | 2026-09-14 | Restored the canonical problem tracker after commit `c8e443a` reduced `PROBLEMS.md` to an empty file despite Rule 41 in `updaterules.md`. | V15 branch restored the tracker content and subsequent milestones keep unresolved work explicit. |
