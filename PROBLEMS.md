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
| SR-P002 | P1 | VERIFY | TikTok V15 is implemented and deterministically tested but has not completed a real developer-app publishing verification. | V15 includes TikTok OAuth, encrypted/rotating token handling, account binding, Creator Info, Direct Post for photo/video, provider-options persistence, status normalization, UI controls, tests, and operator documentation. Repository CI cannot supply a real TikTok developer app, approved scopes, verified media URL prefix, or publishing account. | With real TikTok credentials, verify OAuth -> account identity -> Creator Info -> Direct Post -> status completion using a verified production media domain/prefix; record provider/API evidence before marking resolved. |
| SR-P003 | P1 | VERIFY | V16 provider webhook processing and provider-health/rate-limit visibility are implemented but not verified against live provider delivery. | V16 adds raw-body Meta/TikTok signature verification, replay-age protection for TikTok, webhook persistence/deduplication, TikTok publication/account synchronization, publication-attempt history, provider health/rate-limit snapshots, protected Operations API, dashboard UI, deterministic tests, and PostgreSQL migration coverage. CI cannot originate signed deliveries from approved real provider apps or validate public HTTPS callback configuration. | With approved Meta/TikTok apps and public HTTPS callbacks, verify Meta challenge + signed delivery and TikTok signed Content Posting delivery end to end, including duplicate delivery behavior and Operations Center state; record provider evidence before marking resolved. |
| SR-P004 | P1 | VERIFY | V17 WhatsApp Business is implemented and deterministically tested but has not completed a real Cloud API campaign verification. | V17 now includes E.164 contacts, explicit consent/eligibility, approved-template sync, scheduled campaigns, recipient/message persistence, an independently gated `WHATSAPP_CAMPAIGN` scheduler path, rate-limit retry, duplicate-send-safe `DELIVERY_UNCERTAIN` handling, signed webhook processing, delivery/read/failure synchronization, Operations telemetry, management APIs/UI, JSON/PostgreSQL parity, and migration 006. CI has no approved WhatsApp Business account, production token/sender, approved template, or public HTTPS callback. | With real WhatsApp Business credentials, verify template sync -> opted-in contact -> scheduled send -> provider message ID -> signed sent/delivered/read or failed webhook -> persisted recipient/message state -> Operations Center telemetry. Record real-provider evidence before marking resolved. |
| SR-P010 | P1 | VERIFY | V20 Analytics & Reporting is implemented and deterministically tested but real-provider metric permissions and response behavior are not yet verified. | V20 adds append-only JSON/PostgreSQL metric snapshots, latest-snapshot reporting, filters/KPIs/daily series/per-post views, bounded refresh, provider adapters for Instagram/Facebook/Threads/TikTok, and analytics UI. New connections request Instagram `instagram_business_manage_insights`, Threads `threads_manage_insights`, and TikTok `video.list`; existing connections may require reconnect. CI cannot prove app review, live permission grants, media-type metric availability, or production provider responses. | With approved real provider apps/accounts, reconnect where required and verify representative published posts for Instagram, Facebook Pages, Threads, and TikTok: provider metric fetch -> normalized snapshot -> repeated refresh/history -> latest-snapshot report/KPIs -> UI freshness/error behavior. Record provider/API evidence before marking resolved. |
| SR-P011 | P1 | VERIFY | V31 Instagram carousel scheduling/publishing and the multi-image Composer are implemented and covered by deterministic plus real-browser tests, but the carousel workflow has not been verified against a live approved Instagram Professional account. | V31 covers ordered 1–10 media scheduling, mixed image/video child containers, resumable child/parent provider state, Composer append/state behavior, compatibility, and real Chrome persistence/order. CI cannot supply an approved Meta app/account or production public-HTTPS media and therefore cannot prove Graph child -> parent -> publish/status behavior against the live provider. | With an approved Instagram Professional account and production public-HTTPS media, publish representative image-only and mixed image/video carousels; verify child processing, parent creation, publish result, status completion, persisted provider state, and no duplicate external side effects during retries. Record provider/API evidence before marking resolved. |

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
| SR-P001 | 2026-09-16 | V22–V27 completed the real-browser E2E expansion across authentication/RBAC, Admin user lifecycle, Composer/drafts/reusable content, Media Library, account-bound scheduling, Accounts, WhatsApp, Operations, Analytics, Queue/Calendar filtering and lifecycle actions, drag/drop, and the remaining individual Queue edges. V27 added actual Chrome/CDP handling for the native Reschedule prompt and directly verified accepted, invalid, and dismissed prompt outcomes plus individual Cancel persistence/rendering. | V27 TDD RED run `35074127092` passed migrations `001–010`, 464/464 deterministic tests and JavaScript syntax, then failed only the new real-dialog scenario because `browser.handleNextDialog` was intentionally absent (13/14 browser scenarios passed). GREEN run `35074429461` then passed migrations `001–010`, 464/464 deterministic tests, JavaScript syntax, and all 14/14 real Chrome/CDP scenarios. |
| SR-P006 | 2026-09-16 | V26 replaced the PostgreSQL production auth limiter's per-process counters with shared transactional `rate_limit_buckets` state and added explicit exact-IP trusted-proxy attribution. Forwarded addresses are ignored by default, accepted only when the direct peer is explicitly trusted, resolved right-to-left through trusted hops, and malformed forwarding data falls back to the direct peer. JSON/local development retains the process-local limiter with the same client-attribution rules. | TDD RED runs `35071753748` and `35071785656` failed on the missing V26 contracts. After correcting a PostgreSQL parameter-cast defect found by the first GREEN attempt, code-only GREEN run `35072527173`, exact-final-head run `35073057966`, and merged-main run `35073283844` passed migrations `001–010`, 464/464 deterministic tests, JavaScript syntax, and 12/12 real Chrome/CDP scenarios. |
| SR-P007 | 2026-09-15 | V25 made account-bound `destinations` the default scheduling contract. Valid `platforms`-only requests now fail before persistence unless an operator explicitly enables the default-off `ALLOW_LEGACY_PLATFORM_SCHEDULING=true` compatibility gate. Existing unbound historical records remain readable and no ambiguous account backfill is attempted. | TDD RED run `34977778781` failed only the new default-rejection assertion (448/449 passed). GREEN PR run `34978682385` then passed PostgreSQL migrations `001–009`, 451/451 deterministic tests, JavaScript syntax, and 12/12 real Chrome/CDP scenarios, including account-bound browser scheduling. |
| SR-P009 | 2026-09-14 | Replaced sequential social/WhatsApp scheduling writes with repository-level all-or-nothing graph persistence and added atomic lifecycle mutation units for JSON/PostgreSQL. Final review also closed the scheduler/lifecycle race by carrying expected publication/job state into the mutation, preflighting JSON before patching, and locking/rechecking PostgreSQL rows inside the transaction. | Race-safe V18 GitHub Actions run `34848350574`: PostgreSQL transaction rollback + stale-state tests, JSON failure-injection + stale-state tests, 384/384 tests passed, migrations and syntax checks green. |
| SR-P005 | 2026-09-14 | Implemented the source-defined Calendar/Queue lifecycle controls: month/week/day calendar, drag reschedule, queue filters, edit/reschedule/cancel/duplicate/retry, bulk reschedule/cancel, protected APIs, shared browser state, and transaction-time stale-state protection against scheduler claims. | Race-safe V18 GitHub Actions run `34848350574`: lifecycle service/API/calendar/UI/stale-state tests passed within 384/384 tests; PostgreSQL migrations and JavaScript syntax checks green. Browser E2E remained separately tracked under `SR-P001` until V27. |
| SR-P008 | 2026-09-14 | Restored the canonical problem tracker after commit `c8e443a` reduced `PROBLEMS.md` to an empty file despite Rule 41 in `updaterules.md`. | V15 branch restored the tracker content and subsequent milestones keep unresolved work explicit. |