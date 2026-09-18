# Neon and Vercel Migration Implementation Plan

> Execute with superpowers:subagent-driven-development; one application implementer and an independent reviewer. Provisioning is coordinated separately by the parent.

**Goal:** Move SÄBO-kollen to Vercel + Neon with preserved reports and server-protected administration.
**Architecture:** Static frontend + Node 22 API + Neon PostgreSQL. Signed admin sessions and parameterized SQL.
**Tech Stack:** Vanilla JS, Node test runner, @neondatabase/serverless, a Postgres-compatible local test engine.
**Spec:** docs/superpowers/specs/2026-09-18-neon-vercel-design.md

## Global constraints
- No production data or credentials in git/static output/logs.
- Do not mutate existing Supabase or unrelated cloud resources.
- Preserve the Swedish user flows and complete PDF print dataset.
- Node 22; no frontend framework rewrite.

## Task 1: Application and migration implementation
- [ ] Write behavioral tests first for unauthorized access, session expiry/tampering, login rate limits, report validation/persistence/filtering/pagination, migration transaction/idempotence/escape handling and frontend error handling.
- [ ] Run failing tests to establish missing behavior, then implement minimal API in api/ with reusable server/ modules.
- [ ] Update script.js/index.html to explicit same-origin endpoints and server login; safely render stored text and handle errors.
- [ ] Add schema and migration tools that parse only whitelisted COPY table data from local gzip backup, preserve values/IDs/timestamps and advance sequences; refuse nonempty destinations.
- [ ] Build only approved public assets, configure Vercel, document required secrets and deployment/migration/rollback.
- [ ] Run tests and build, inspect diff, and produce implementation report.

## Task 2: Independent review and preview
- [ ] Review the complete app diff against the spec, focusing on authorization, SQL, secrets, import safety and deploy configuration.
- [ ] Resolve material findings and rerun covering checks.
- [ ] Verify browser flows against synthetic data before production cutover.

## Task 3: Cloud provisioning and data cutover
- [ ] Inspect Vercel Neon create workflow and choose a dedicated Free database in an EU region where available.
- [ ] Push tested migration branch and create Vercel project/preview from the correct repository/branch.
- [ ] Set DATABASE_URL, session signing secret and a new admin password hash securely.
- [ ] Import local backup with explicit empty-target check; compare complete data and counts (21/76).
- [ ] Verify deployed read/login/filter/print flow and publish final URL; retain old data and hosting for rollback.
