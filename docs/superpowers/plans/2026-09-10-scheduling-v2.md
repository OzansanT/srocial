# Scheduling Workflow V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runnable end-to-end scheduled social-post workflow with development persistence, scheduler records, API endpoints, PostgreSQL schema, and dashboard composer UI.

**Architecture:** Keep the Node HTTP layer thin and dependency-free. Route requests into a post service that validates input and writes posts, publications, and scheduler jobs through a repository contract. Use a JSON file repository for development runtime and check in a PostgreSQL migration as the production schema target.

**Tech Stack:** Node.js >=20 built-ins, vanilla HTML/CSS/JS, Node test runner, JSON development storage, PostgreSQL DDL.

**Spec:** `docs/superpowers/specs/2026-09-10-scheduling-workflow-design.md`

## Global Constraints

- Follow `README.md` and `updaterules.md`.
- Do not add frontend frameworks or browser automation.
- Do not call real provider APIs.
- Keep `ALLOW_REAL_PUBLISH=false` as the default.
- WhatsApp must not be accepted as a social publication platform.
- Keep HTTP, validation, persistence, scheduler, and UI responsibilities isolated.
- Store scheduled timestamps as UTC ISO strings at the backend boundary.
- Tests must not depend on external network services.

---

### Task 1: Post Domain and Validation

**Files:**
- Create: `server/services/post-service.js`
- Test: `tests/post-service.test.js`

**Interfaces:**
- Consumes: repository methods `createPost(record)`, `createPublication(record)`, `createJob(record)`, `listPostsWithPublications()`.
- Produces: `createScheduledPost(repository, input, options)` and `listScheduledPosts(repository)`.

- [ ] **Step 1: Write failing tests** for empty caption, unsupported platform, past timestamp, platform deduplication, and record creation.
- [ ] **Step 2: Run** `node --test tests/post-service.test.js` and verify the missing module/behavior fails.
- [ ] **Step 3: Implement minimal service** that trims caption, normalizes unique social platforms, validates future schedule time, creates one `SCHEDULED` publication and one `SOCIAL_PUBLICATION` job per platform, and returns the aggregate result.
- [ ] **Step 4: Run** `node --test tests/post-service.test.js` and verify all service tests pass.
- [ ] **Step 5: Commit** as `feat: add scheduled post service`.

### Task 2: Development Repository and PostgreSQL Schema

**Files:**
- Create: `server/db/json-repository.js`
- Create: `server/db/create-repository.js`
- Create: `server/db/migrations/001_initial.sql`
- Modify: `.env.example`
- Modify: `.gitignore`
- Test: `tests/json-repository.test.js`

**Interfaces:**
- Consumes: plain records from the post service.
- Produces: async repository methods `createPost`, `createPublication`, `createJob`, `listPostsWithPublications`, `listJobs`, and `initialize`.

- [ ] **Step 1: Write failing repository tests** using a temporary directory, including persistence after a second repository instance opens the same file.
- [ ] **Step 2: Run** `node --test tests/json-repository.test.js` and verify failure.
- [ ] **Step 3: Implement JSON repository** with UUID ids, directory creation, atomic temp-file replacement, serialized mutations, and copied return values.
- [ ] **Step 4: Add `001_initial.sql`** defining users/accounts/posts/media/publications/publication_attempts/scheduler_jobs/webhook_events plus WhatsApp contacts/templates/campaign/message tables with foreign keys and useful indexes.
- [ ] **Step 5: Add `DATA_FILE=./data/srocial.json`** to `.env.example` and ignore runtime JSON under `data/`.
- [ ] **Step 6: Run** repository tests and verify persistence behavior passes.
- [ ] **Step 7: Commit** as `feat: add development persistence and database schema`.

### Task 3: HTTP Post API

**Files:**
- Create: `server/http/read-json-body.js`
- Create: `server/routes/posts.js`
- Modify: `server/app.js`
- Modify: `server/server.js`
- Test: `tests/posts-api.test.js`
- Modify: `tests/server.test.js` if injection setup needs updating.

**Interfaces:**
- Consumes: post service and repository.
- Produces: `GET /api/posts` and `POST /api/posts`.

- [ ] **Step 1: Write failing API tests** for create, list, malformed JSON, and validation errors.
- [ ] **Step 2: Run** `node --test tests/posts-api.test.js` and verify failure.
- [ ] **Step 3: Implement body parser** with JSON content handling and a 1 MiB limit.
- [ ] **Step 4: Implement posts route functions** that map domain validation to `400`, successful creation to `201`, and list to `200`.
- [ ] **Step 5: Inject repository into `createRequestHandler`** and initialize the repository before listening in `server/server.js`.
- [ ] **Step 6: Run** API and existing server tests.
- [ ] **Step 7: Commit** as `feat: add post scheduling API`.

### Task 4: Dashboard Composer and Scheduled List

**Files:**
- Modify: `client/index.html`
- Create: `client/css/components/form.css`
- Create: `client/css/pages/composer.css`
- Modify: `client/css/pages/dashboard.css`
- Create: `client/js/api/posts-api.js`
- Create: `client/js/pages/composer.js`
- Modify: `client/js/pages/dashboard.js`
- Modify: `client/js/app.js`

**Interfaces:**
- Consumes: `GET /api/posts`, `POST /api/posts`.
- Produces: schedule form submission and upcoming-post rendering.

- [ ] **Step 1: Add semantic form markup** with caption, social platform checkboxes, local datetime input, feedback region, and Schedule button.
- [ ] **Step 2: Add isolated component/page styles** using existing root tokens only.
- [ ] **Step 3: Add posts API module** with `listPosts()` and `createPost(input)`.
- [ ] **Step 4: Add composer module** that converts the local datetime to ISO UTC, submits, renders errors, resets on success, and calls a supplied refresh callback.
- [ ] **Step 5: Extend dashboard rendering** to show upcoming scheduled posts and publication platform states.
- [ ] **Step 6: Run `node --check`** on all changed frontend JavaScript.
- [ ] **Step 7: Commit** as `feat: add scheduling composer UI`.

### Task 5: Full Verification and Documentation Alignment

**Files:**
- Modify: `README.md` only where setup/data-flow documentation changed.

**Interfaces:**
- Consumes: completed V2 tree.
- Produces: verified merge-ready branch.

- [ ] **Step 1: Run** `npm test` and require zero failures.
- [ ] **Step 2: Run `node --check`** across all server and client JavaScript.
- [ ] **Step 3: Start the server against a temporary `DATA_FILE`** and smoke-test `/`, `GET /api/posts`, `POST /api/posts`, then `GET /api/posts` again.
- [ ] **Step 4: Scan repository changes** for accidental secrets and forbidden real-publish logic.
- [ ] **Step 5: Update README** to document the development JSON store, new API endpoints, and PostgreSQL migration target.
- [ ] **Step 6: Commit** as `docs: document scheduling workflow`.
- [ ] **Step 7: Create a PR, verify the remote diff, and merge into `main`** because the user explicitly authorized merge-without-ask for this development pass.
