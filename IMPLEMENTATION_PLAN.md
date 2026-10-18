# Rental Management System — Implementation Plan

> Generated: 2026-09-06  
> Status at planning time: Infrastructure not wired, Auth scaffolded, entities defined

Each phase has a clear **goal**, ordered **tasks**, and an **exit criterion** — a concrete
statement of what "done" means before moving to the next phase.

---

## Phase 0 — Local Infrastructure

**Goal:** Get a real database running locally so every phase after this can be developed
and tested against actual PostgreSQL.

### Tasks
1. Add `docker-compose.yml` with a `postgres` service and a `pgAdmin` (or `adminer`) service.
2. Add `.env.example` with all variables — including the five DB variables — filled in with
   safe local defaults.
3. Copy `.env.example` → `.env`, confirm the app starts without crashing on boot.
4. Create `src/database/data-source.ts` — a standalone `DataSource` config for the
   TypeORM CLI (reads the same env vars as the app).
5. Wire `TypeOrmModule.forRootAsync()` into `AppModule`, pointing at the `DataSource` config.
6. Set `synchronize: false`, `logging: true` in development.
7. ✅ Create the first migration: `InitialSchema` — generates DDL for all nine entities already
   defined (`users`, `organizations`, `organization_memberships`,
   `organization_membership_roles`, `roles`, `permissions`, `role_permissions`,
   `user_global_roles`, `refresh_token_sessions`).
8. Write a seed script (`src/database/seed.ts`) that inserts the four roles
   (`platform_admin`, `property_manager`, `tenant`, `viewer`) and all ten permissions,
   then maps them via `role_permissions`.
9. Add npm scripts: `migration:run`, `migration:revert`, `migration:generate`, `seed`.

### Exit Criterion
`npm run migration:run && npm run seed` completes without errors, and the app starts and
responds to `GET /users/me` with a 401 (guard is live, DB is connected).

---

## Phase 1 — Auth Hardening

**Goal:** Replace the trust-the-caller login stub with a real credential flow and
DB-backed sessions.

### Tasks
1. ✅ **Registration** — `POST /auth/register`
   - Accept `email` + `password`.
   - Hash with `bcrypt` (already a dep), insert into `users`.
   - Return a minimal success body (no token — force an explicit login).
2. ✅ **Real login** — rewrite `POST /auth/login`
   - Accept `email` + `password` only (drop the role/permission fields from the DTO).
   - Look up the user by email; verify `bcrypt.compare`.
   - Query DB for the user's global roles + permissions to embed in the JWT.
   - Reject inactive users (`isActive = false`).
3. ✅ **Persist refresh sessions** — wire `RefreshTokenSessionEntity` to `AuthService`
   - Hash the refresh token with SHA-256 before storing (not bcrypt: it only reads the
     first 72 bytes, and JWTs share a near-identical prefix).
   - On `POST /auth/refresh`: load the session by `sessionId`, verify hash,
     check `expiresAt` and `revokedAt`, then rotate.
   - On `POST /auth/logout`: set `revokedAt = NOW()` in the DB row.
4. Protect `POST /auth/register` with a global rate-limit guard or a simple
   `throttler` module to prevent enumeration.

### Exit Criterion
Full auth round-trip works against the DB: register → login gets real JWT with DB-sourced
roles → refresh rotates the stored session → logout marks the session revoked →
a second refresh with the old token is rejected.

---

## Phase 2 — Users Module (DB-backed)

**Goal:** Make the users endpoints real — reads and writes go to the database.

### Tasks
1. Inject `UserRepository` (TypeORM) into `UsersService`.
2. `GET /users/me` — already returns JWT claims; enrich it with a live DB fetch
   so the response reflects the actual `users` row (useful once user updates land).
3. `GET /users` — implement `listForAdministration()` with pagination
   (`page`, `limit` query params; default `limit=20`).
4. `GET /users/:id` — fetch single user; 404 if not found.
5. `POST /users` — admin creates a user (hashes password, sets `isActive = true`).
6. `PATCH /users/:id` — partial update (`email`, `isActive`; password change is a
   separate concern).
7. `DELETE /users/:id` — soft-delete: set `isActive = false` rather than dropping the row.
8. Add DTOs + `class-validator` decorators for each mutating endpoint.
9. Guard assignments:
   - All mutating endpoints: `JWT + platform_admin + users.manage`
   - `GET /users/:id`: `JWT + platform_admin + users.read`

### Exit Criterion
All six endpoints return correct HTTP status codes, validated payloads, and accurate DB
state. A deactivated user can no longer log in.

---

## Phase 3 — Organizations Module

**Goal:** Full CRUD for organizations and their memberships.

### Tasks
1. Create `OrganizationsModule`, `OrganizationsController`, `OrganizationsService`.
2. Organization CRUD:
   - `POST /organizations` — create; `platform_admin` only.
   - `GET /organizations` — list (paginated); `platform_admin` or scoped to the
     caller's memberships for non-admins.
   - `GET /organizations/:organizationId` — fetch one; member or admin.
   - `PATCH /organizations/:organizationId` — update name/slug; `property_manager` of that org or admin.
   - `DELETE /organizations/:organizationId` — soft-delete or hard-delete (decide policy); admin only.
3. Membership management (all under `/organizations/:organizationId/members`):
   - `POST /members` — invite a user by email; assign initial roles (`roleIds`).
     Creates `organization_memberships` + `organization_membership_roles` rows.
   - `GET /members` — list members with their roles.
   - `PATCH /members/:userId` — change the member's roles (or reuse the existing role-assignment endpoint).
   - `DELETE /members/:userId` — remove membership.
4. Membership endpoints assign roles by id (platform templates or the org's custom roles);
   role assignment itself already exists (`PUT /organizations/:organizationId/members/:userId/roles`).
5. Org-scoped authorization is already in place (Phase 7): use `:organizationId` as the
   route param name on every org route and `@RequirePermissions(...)`. Services must still
   scope every query by `organizationId` — the guard authorizes, it does not filter data.

### Exit Criterion
A `platform_admin` can create an org and add a user as `property_manager`. That
`property_manager` can read the org's details but cannot delete it. Guards enforce this
from DB-resolved permissions.

---

## Phase 4 — Properties Module

**Goal:** Properties live under organizations; `property_manager` and `platform_admin`
can manage them, members can read them.

### Tasks
1. Define `PropertyEntity` — columns: `id`, `organizationId (FK)`, `name`, `address`,
   `description`, `isActive`, `createdAt`, `updatedAt`.
2. Generate and run migration.
3. Create `PropertiesModule`, `PropertiesController`, `PropertiesService`.
4. Endpoints (all under `/organizations/:organizationId/properties`):
   - `POST /` — create; `property_manager` + `properties.manage`.
   - `GET /` — list; `properties.read` (paginated, filter by `isActive`).
   - `GET /:id` — fetch one; `properties.read`.
   - `PATCH /:id` — update; `properties.manage`.
   - `DELETE /:id` — soft-delete (`isActive = false`); `properties.manage`.
5. Enforce org scoping: a property's `organizationId` must match `:organizationId` on every
   request — never trust the body alone.
6. Add DTOs with validation.

### Exit Criterion
A `property_manager` of Org A can manage Org A's properties but receives 403 on any
request scoped to Org B.

---

## Phase 5 — Leases Module

**Goal:** Leases tie a tenant (user) to a property for a date range with a rent amount.

### Tasks
1. Define `LeaseEntity` — columns: `id`, `organizationId (FK)`, `propertyId (FK)`,
   `tenantUserId (FK → users)`, `startDate`, `endDate`, `rentAmount` (decimal),
   `status` (enum: `active | expired | terminated`), `createdAt`, `updatedAt`.
2. Generate and run migration.
3. Create `LeasesModule`, `LeasesController`, `LeasesService`.
4. Endpoints (all under `/organizations/:organizationId/leases`):
   - `POST /` — create; `leases.manage`. Validate that `propertyId` belongs to `orgId`.
   - `GET /` — list; `leases.read`. Support filter by `status`, `propertyId`, `tenantUserId`.
   - `GET /:id` — fetch one; `leases.read`.
   - `PATCH /:id` — partial update (dates, rent, status); `leases.manage`.
   - `DELETE /:id` — terminate: set `status = terminated`; `leases.manage`.
5. Add a `LeaseStatusService` (or a cron task) that transitions `status` from
   `active → expired` when `endDate` passes.  
   *(Can be a simple scheduled task with `@nestjs/schedule` — keep it minimal for now.)*
6. Add DTOs with validation (date ordering: `startDate < endDate`).

### Exit Criterion
A `property_manager` can create a lease linking a tenant user to a property, and the
lease transitions to `expired` once its end date passes.

---

## Phase 6 — Payments Module

**Goal:** Payments record rent collection against a lease.

### Tasks
1. Define `PaymentEntity` — columns: `id`, `leaseId (FK)`, `organizationId (FK)`,
   `amountDue` (decimal), `amountPaid` (decimal, nullable), `dueDate`, `paidDate`
   (nullable), `status` (enum: `pending | paid | overdue`), `notes`, `createdAt`,
   `updatedAt`.
2. Generate and run migration.
3. Create `PaymentsModule`, `PaymentsController`, `PaymentsService`.
4. Endpoints (all under `/organizations/:organizationId/payments`):
   - `POST /` — create a payment record against a lease; `payments.manage`.
     Validate `leaseId` belongs to `orgId`.
   - `GET /` — list; `payments.read`. Filter by `status`, `leaseId`, `dueDate` range.
   - `GET /:id` — fetch one; `payments.read`.
   - `PATCH /:id` — record a payment (`amountPaid`, `paidDate`, transition `status → paid`);
     `payments.manage`.
   - `DELETE /:id` — void a payment (soft-delete or set `status = voided`);
     `payments.manage`.
5. Overdue detection: a scheduled task marks `status = overdue` when `dueDate` has
   passed and `status` is still `pending`.
6. Add DTOs with validation.

### Exit Criterion
A `property_manager` can create a payment record, record a payment against it, and list
overdue payments for a lease.

---

## Phase 7 — RBAC Hardening (DB-backed) ✅ Done (ahead of Phases 3–6)

**Goal:** Roles and permissions are managed via API, not hard-coded, and the guard always
sees the live DB state.

### Delivered
- Permission-only authorization: `@RequirePermissions` + global `PermissionsGuard`;
  `RolesGuard` / `@RequireRoles` / role enums removed.
- Permissions are a code catalog (`PERMISSION_CATALOG`, with the role scopes each may be
  held by); roles are data: platform global roles, platform org templates, and per-org
  custom roles (`roles.organization_id`). Seed-owned system roles are read-only via API.
- Effective permissions resolved from the DB per request (`AccessControlService`):
  global roles ∪ roles in the `:organizationId` org. Tokens carry identity only.
- Role CRUD (`/roles`, `/organizations/:organizationId/roles`), `GET /permissions`,
  assignment (`PUT /users/:userId/roles`, `PUT /organizations/:organizationId/members/:userId/roles`).
- Anti-escalation: callers can only create, change, delete, assign or unassign roles whose
  permissions they all hold.

### Exit Criterion (met)
Removing a permission from a role takes effect on the user's very next request (e2e).

### Remaining
- Optional per-request permission cache if the guard query becomes a hotspot.
- Guard against removing the last `platform_admin`.

---

## Phase 8 — Developer Experience & Quality

**Goal:** The project is ready for other developers to onboard and the core logic is
tested.

### Tasks
1. **Swagger** — add `@nestjs/swagger`, annotate all DTOs and controllers with
   `@ApiProperty`, `@ApiOperation`, `@ApiBearerAuth`. Expose at `/api/docs`.
2. **Unit tests**:
   - `AuthService` — login, refresh, logout logic.
   - `PermissionsGuard` — permission present / absent / missing decorator cases.
3. **E2E tests** — auth flow (`register → login → refresh → logout → stale refresh rejected`).
4. **README** — setup steps, env vars table, migration + seed commands, link to Swagger.
5. **CI baseline** — a GitHub Actions (or equivalent) workflow that runs
   `lint → build → test` on every push.

### Exit Criterion
`npm run test` and `npm run test:e2e` pass cleanly. Swagger UI is reachable at
`/api/docs` and documents every endpoint. A new developer can follow the README from
clone to running app in under 10 minutes.

---

## Dependency Graph

```
Phase 0 (Infrastructure)
  └── Phase 1 (Auth Hardening)
        └── Phase 2 (Users Module)
              └── Phase 3 (Organizations)
                    └── Phase 4 (Properties)
                          └── Phase 5 (Leases)
                                └── Phase 6 (Payments)

Phase 3 (Organizations)  ──┐
Phase 4 (Properties)     ──┤──► Phase 7 (RBAC Hardening)
Phase 5 (Leases)         ──┘

Phase 7 ──► Phase 8 (DX & Quality)
```

Phase 8 tasks (Swagger annotations, tests) can be done incrementally alongside each
phase — adding them here at the end just ensures nothing ships without them.

---

## Quick Reference — Guard Matrix

Routes check permissions only. On routes with `:organizationId` the caller's global
permissions plus their permissions in that org count; elsewhere only global ones.

| Endpoint group            | JWT | Permission required  |
|---------------------------|-----|----------------------|
| `POST /auth/*`            | —   | —                    |
| `GET /users/me`, `/users/me/permissions`, `GET /permissions` | ✓ | — |
| `GET/POST/PATCH/DELETE /users` | ✓ | `users.read/.manage` |
| `/roles`, `/users/:userId/roles` | ✓ | `roles.read/.manage` (global) |
| `/organizations/:organizationId/roles`, `.../members/:userId/roles` | ✓ | `roles.read/.manage` (in org) |
| `POST /organizations`     | ✓   | `organizations.manage` (global) |
| `GET /organizations`      | ✓   | — (service lists the caller's orgs; all with global `organizations.read`) |
| `GET/PATCH /organizations/:organizationId` | ✓ | `organizations.read/.manage` (in org) |
| `DELETE /organizations/:organizationId` | ✓ | `organizations.manage` — decide in Phase 3 whether org-level managers may delete |
| `/organizations/:organizationId/members/*` | ✓ | `organizations.manage` (in org) |
| `/organizations/:organizationId/properties/*` | ✓ | `properties.read/.manage` (in org) |
| `/organizations/:organizationId/leases/*` | ✓ | `leases.read/.manage` (in org) |
| `/organizations/:organizationId/payments/*` | ✓ | `payments.read/.manage` (in org) |
