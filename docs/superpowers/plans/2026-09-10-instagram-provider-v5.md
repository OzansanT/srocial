# Instagram Provider V5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Srocial's first real provider integration for Instagram professional accounts using Instagram Login and the current Instagram Graph publishing flow.

**Architecture:** Keep the existing generic OAuth/account services unchanged and plug Instagram into them through a provider-specific adapter. Isolate HTTP, OAuth, validation, and publishing under `server/platforms/instagram/`; runtime registration is conditional on credentials and live scheduling remains disabled.

**Tech Stack:** Node.js >=20, built-in `fetch`, ES modules, built-in `node:test`, Instagram Graph API v26.0 by default.

**Spec:** `docs/superpowers/specs/2026-09-10-instagram-provider-design.md`

## Global Constraints

- Use Instagram Login, not the Facebook-Page-dependent Instagram flow.
- Request only `instagram_business_basic` and `instagram_business_content_publish` in V5.
- Default Instagram Graph API version to `v26.0` and allow an environment override.
- Never expose or log provider tokens or client secrets.
- Keep `ALLOW_REAL_PUBLISH=false` as the default.
- Do not start a recurring scheduler loop in V5.
- No new npm dependency.
- Tests must not make real provider requests.

---

### Task 1: Instagram Configuration

**Files:**
- Create: `server/platforms/instagram/config.js`
- Create: `tests/instagram-config.test.js`
- Modify: `.env.example`

**Interfaces:**
- Produces `INSTAGRAM_SCOPES`.
- Produces `getInstagramConfig(env)` returning `null` when required credentials are absent, otherwise `{appId, appSecret, apiVersion, scopes}`.

- [ ] Write tests asserting missing credentials return `null`, configured credentials return values, default API version is `v26.0`, and scope order is stable.
- [ ] Run `node --test tests/instagram-config.test.js` and verify failure because the module is absent.
- [ ] Implement the minimal configuration module.
- [ ] Run the test and verify pass.

### Task 2: Safe Instagram HTTP Client

**Files:**
- Create: `server/platforms/instagram/client.js`
- Create: `tests/instagram-client.test.js`

**Interfaces:**
- Produces `InstagramProviderError` with safe `code`, `status`, and provider metadata that excludes credential-bearing URLs/body values.
- Produces `createInstagramClient({fetchImpl, apiVersion})` with `formPost(url, fields)`, `getGraph(path, query)`, and `postGraph(path, body)`.

- [ ] Write tests for successful JSON parsing, form encoding, bearer-safe graph calls, rate-limit/auth/permission/provider error mapping, and network errors.
- [ ] Run the test and verify failure because the module is absent.
- [ ] Implement the minimal client using injected `fetchImpl`.
- [ ] Run the test and verify pass.

### Task 3: Instagram OAuth Adapter

**Files:**
- Create: `server/platforms/instagram/auth.js`
- Create: `tests/instagram-auth.test.js`

**Interfaces:**
- Produces `createInstagramOAuthProvider({config, client, now})` implementing `getAuthorizationUrl`, `exchangeCode`, and `getAccountIdentity`.

- [ ] Write a test asserting authorization URL host/path, client id, callback, state, response type, and exact scopes.
- [ ] Write a test asserting `exchangeCode()` posts the authorization code to `https://api.instagram.com/oauth/access_token`, exchanges the short token at `/access_token` using `ig_exchange_token`, and returns a computed expiry.
- [ ] Write a test asserting `getAccountIdentity()` maps `/me?fields=id,username,account_type,profile_picture_url` into Srocial identity fields.
- [ ] Run the test and verify failure because the module is absent.
- [ ] Implement the adapter.
- [ ] Run tests and verify pass.

### Task 4: Instagram Publication Validation

**Files:**
- Create: `server/platforms/instagram/validator.js`
- Create: `tests/instagram-validator.test.js`

**Interfaces:**
- Produces `validateInstagramPublication({post, media})` returning normalized single-media input.

- [ ] Write failing tests for missing media, HTTP/non-HTTPS URL, unsupported media type, and multiple media items.
- [ ] Add passing target cases for one `image` and one `video` using HTTPS URLs.
- [ ] Implement validation that throws errors with `code='INVALID_MEDIA'` and `retryable=false`.
- [ ] Run tests and verify pass.

### Task 5: Instagram Publish/Status Adapter

**Files:**
- Create: `server/platforms/instagram/publish.js`
- Create: `tests/instagram-publish.test.js`

**Interfaces:**
- Produces `createInstagramPublishingAdapter({client, resolveCredentials, getMedia})` with `publish({post, publication})` and `getStatus({publication})`.

- [ ] Write failing test: missing `publication.accountId` fails permanently before provider calls.
- [ ] Write failing test: single image creates a container with `image_url` + caption and then calls `/media_publish`, returning `PUBLISHED`.
- [ ] Write failing test: Reel creation uses `video_url` and `media_type=REELS`; non-finished container returns `PROCESSING`.
- [ ] Write failing test: finished Reel status calls `/media_publish` and returns `PUBLISHED`.
- [ ] Write failing test: provider `ERROR`/`EXPIRED` container status returns `FAILED` with safe error code.
- [ ] Implement the adapter using server-only credentials resolved by account id.
- [ ] Run publish tests and verify pass.

### Task 6: Instagram Composition and Runtime Registration

**Files:**
- Create: `server/platforms/instagram/index.js`
- Modify: `server/server.js`
- Create: `tests/instagram-registration.test.js`

**Interfaces:**
- Produces `registerInstagramProvider({env, oauthRegistry, platformRegistry, repository, cipher, fetchImpl})`.
- Returns `{configured:false}` without credentials and `{configured:true}` after registering OAuth/provider adapters.

- [ ] Write failing tests for missing-config no-op and configured registration.
- [ ] Implement a server-only credential resolver that decrypts the selected account's access token and rejects disconnected/wrong-provider accounts.
- [ ] Compose the OAuth and publishing adapters.
- [ ] Update `server/server.js` to create both registries and conditionally register Instagram.
- [ ] Run tests and verify pass.

### Task 7: Media Repository Seam

**Files:**
- Modify: `server/db/json-repository.js`
- Create: `tests/media-repository.test.js`

**Interfaces:**
- Adds backward-compatible `media: []` collection.
- Produces `createMedia(record)` and `listMediaForPost(postId)`.

- [ ] Write failing persistence tests for media records and old JSON without the collection.
- [ ] Implement the minimal repository methods.
- [ ] Run repository tests and verify pass.

This seam makes the Instagram publishing adapter fully testable with repository-backed media, but V5 does not yet modify the social composer/API to create media or select accounts.

### Task 8: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] Document Instagram Login setup, scopes, v26.0 default, current V5 capability, and the remaining V6 binding step.
- [ ] Run the complete available local test suite reconstructed for all touched subsystems and require zero failures.
- [ ] Run `node --check` against every new/modified JavaScript file.
- [ ] Search changed files for accidental secrets/token values.
- [ ] Compare the feature branch against `main` and review changed paths.
- [ ] Open a PR and squash-merge to `main` using the user's standing merge-without-ask authorization.
