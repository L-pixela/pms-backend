# Rental Management System — Project Tracking

> Last updated: 2026-10-18

---

## Overview

A **multi-tenant property rental management REST API** built with NestJS.
Landlords / property management companies (Organizations) can manage their Properties,
Leases, and Payments. Users belong to Organizations with scoped roles.

---

## Tech Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Framework    | NestJS 11 (Express platform)            |
| Language     | TypeScript 5                            |
| ORM          | TypeORM 0.3                             |
| Database     | PostgreSQL (`pg`)                       |
| Auth         | Passport.js + `passport-jwt` + `@nestjs/jwt` |
| Validation   | `class-validator` + `class-transformer` |
| Config       | `@nestjs/config` (`.env` based)         |
| Testing      | Jest + Supertest                        |

---

## Architecture

### Request Lifecycle

```
HTTP Request
  │
  ├─► JwtAuthGuard          (global APP_GUARD #1, skipped for @Public() routes)
  │     Validates Bearer access token, populates request.user
  │
  ├─► RolesGuard            (global APP_GUARD #2)
  │     Reads @RequireRoles() metadata
  │     Checks globalRoles / organizationRoles from JWT
  │     Org = :organizationId param (header only as fallback; mismatch → 403)
  │
  ├─► PermissionsGuard      (global APP_GUARD #3)
  │     Reads @RequirePermissions() metadata
  │     Checks permissions[] from JWT
  │
  └─► Controller → Service → Repository → PostgreSQL

Global guards run in registration order (AppModule providers), and all of them
run before any controller-level @UseGuards, which is why JwtAuthGuard must be
global too.
```

### Module Layout

```
src/
├── main.ts                        Bootstrap, global ValidationPipe (whitelist, transform)
├── app.module.ts                  Root module — imports AuthModule, UsersModule
│
├── auth/                          Authentication feature module
│   ├── auth.controller.ts         POST /auth/register, /auth/login, /auth/refresh, /auth/logout (@Public)
│   ├── auth.service.ts            Credential check, token issuance, DB-backed session rotation
│   ├── user-claims.service.ts     Loads roles + permissions from the DB for tokens
│   ├── auth.module.ts             JwtModule (async config), PassportModule
│   ├── dto/
│   │   ├── login.dto.ts           email, password
│   │   ├── register.dto.ts        email, password (8–72 chars)
│   │   └── refresh-token.dto.ts   refreshToken string
│   ├── entities/
│   │   └── refresh-token-session.entity.ts   refresh_token_sessions (SHA-256 token hash)
│   ├── guards/
│   │   └── jwt-auth.guard.ts      Extends AuthGuard('jwt'); honors @Public()
│   ├── interfaces/
│   │   └── token-payload.interface.ts        AccessTokenPayload, RefreshTokenPayload
│   ├── strategies/
│   │   └── jwt.strategy.ts        Reads Bearer token, maps payload → AuthenticatedUser
│   └── types/
│       └── auth-token-response.type.ts
│
└── modules/
    ├── shared/                    Cross-cutting concerns (no NestJS module yet)
    │   ├── constants/
    │   │   └── permissions.ts     String constants: users.read, properties.manage, etc.
    │   ├── decorators/
    │   │   ├── current-user.decorator.ts         @CurrentUser() param decorator
│   │   ├── public.decorator.ts               @Public(): skip authentication
    │   │   ├── require-roles.decorator.ts         @RequireRoles({global, organization})
    │   │   └── require-permissions.decorator.ts   @RequirePermissions(...perms)
    │   ├── entities/
    │   │   ├── role.entity.ts             roles table (key, name, scope: global|organization)
    │   │   ├── permission.entity.ts       permissions table (key, description)
    │   │   └── role-permission.entity.ts  role_permissions join table
    │   ├── enums/
    │   │   ├── global-role.enum.ts        GlobalRole.PLATFORM_ADMIN
    │   │   └── organization-role.enum.ts  PROPERTY_MANAGER | TENANT | VIEWER
    │   ├── guards/
    │   │   ├── roles.guard.ts             Global guard — checks roles from JWT
    │   │   └── permissions.guard.ts       Global guard — checks permissions from JWT
    │   └── interfaces/
    │       └── authenticated-user.interface.ts    Shape of request.user
    │
    ├── users/
    │   ├── users.controller.ts    GET /users/me, GET /users (admin stub)
    │   ├── users.service.ts       getCurrentUser(), listForAdministration() (stub)
    │   ├── users.module.ts
    │   └── entities/
    │       ├── user.entity.ts             users table
    │       └── user-global-role.entity.ts user_global_roles join table
    │
    ├── organizations/             Entities only — no controller/service/module
    │   └── entities/
    │       ├── organization.entity.ts
    │       ├── organization-membership.entity.ts
    │       └── organization-membership-role.entity.ts
    │
    ├── properties/                Empty placeholder
    ├── leases/                    Empty placeholder
    └── payments/                  Empty placeholder
```

---

## Database Schema (Entities Defined)

```
┌─────────────┐        ┌────────────────────────┐        ┌───────────────┐
│    users    │──────<<│ organization_memberships│>>──────│ organizations │
│─────────────│        │────────────────────────│        │───────────────│
│ id (PK)     │        │ id (PK)                │        │ id (PK)       │
│ email       │        │ user_id (FK)           │        │ slug (UK)     │
│ passwordHash│        │ organization_id (FK)   │        │ name          │
│ isActive    │        └────────────────────────┘        └───────────────┘
└─────────────┘                   │
       │                          │ <<
       │               ┌──────────────────────────────┐
       │               │ organization_membership_roles │
       │               │──────────────────────────────│
       │               │ membership_id (FK)            │──┐
       │               │ role_id (FK)                  │  │
       │               └──────────────────────────────┘  │
       │                                                   │
       │ <<                                                │
┌──────────────────┐      ┌───────────────────────┐       │
│ user_global_roles│      │         roles         │<──────┘
│──────────────────│      │───────────────────────│
│ user_id (FK)     │──────│ id (PK)               │──┐
│ role_id (FK)     │      │ key (UK)              │  │
└──────────────────┘      │ name                  │  │
                          │ scope (global|org)    │  │
                          └───────────────────────┘  │
                                                      │ <<
                          ┌───────────────────────┐   │
                          │    role_permissions   │<──┘
                          │───────────────────────│
                          │ role_id (FK)          │──── roles
                          │ permission_id (FK)    │──┐
                          └───────────────────────┘  │
                                                      │
                          ┌───────────────────────┐   │
                          │     permissions       │<──┘
                          │───────────────────────│
                          │ id (PK)               │
                          │ key (UK)              │
                          │ description           │
                          └───────────────────────┘

┌────────────────────────┐
│ refresh_token_sessions │  (wired to AuthService)
│────────────────────────│
│ id (PK)                │
│ user_id (FK)           │
│ session_id (UK)        │
│ token_hash             │
│ expires_at             │
│ revoked_at (nullable)  │
└────────────────────────┘
```

---

## Authorization Model

### Roles (two scopes)

| Scope        | Enum Value         | Role Key           |
|--------------|--------------------|--------------------|
| Global       | `GlobalRole`       | `platform_admin`   |
| Organization | `OrganizationRole` | `property_manager` |
| Organization | `OrganizationRole` | `tenant`           |
| Organization | `OrganizationRole` | `viewer`           |

Organization role context is the `:organizationId` route parameter. The
`X-Organization-Id` header is used only on routes without that parameter; if both
are present and differ, the request is rejected with 403.

### Permissions

| Key                    | Intended Purpose             |
|------------------------|------------------------------|
| `users.read`           | View user list               |
| `users.manage`         | Create/update/delete users   |
| `organizations.read`   | View organizations           |
| `organizations.manage` | Create/update/delete orgs    |
| `properties.read`      | View properties              |
| `properties.manage`    | Create/update/delete properties |
| `leases.read`          | View leases                  |
| `leases.manage`        | Create/update/delete leases  |
| `payments.read`        | View payments                |
| `payments.manage`      | Create/update/delete payments|

### Guard Chain (applied globally)
```
JwtAuthGuard → RolesGuard → PermissionsGuard
```
Roles and permissions are read from the JWT, whose claims are loaded from the DB
at login and again on every refresh. The flat `permissions[]` only contains
permissions of global roles; org-scoped permissions are an open Phase 3 question.

---

## API Endpoints

### Auth
| Method | Path            | Auth | Description                        |
|--------|-----------------|------|------------------------------------|
| POST   | /auth/register  | None | Create a user (email + password)   |
| POST   | /auth/login     | None | Verify credentials, issue tokens   |
| POST   | /auth/refresh   | None | Rotate session, reload claims      |
| POST   | /auth/logout    | None | Revoke refresh session             |

### Users
| Method | Path       | Guards                                  | Description                     |
|--------|------------|-----------------------------------------|---------------------------------|
| GET    | /users/me  | JWT                                     | Current user profile (from JWT) |
| GET    | /users     | JWT + `platform_admin` + `users.read`   | List all users (stub)           |

---

## Environment Variables

| Variable                        | Default              | Description                    |
|---------------------------------|----------------------|--------------------------------|
| `PORT`                          | `3000`               | HTTP listen port               |
| `NODE_ENV`                      | `development`        | `development` / `production` / `test` |
| `JWT_ACCESS_SECRET`             | **required**         | Access token signing key (≥32 chars in production) |
| `JWT_REFRESH_SECRET`            | **required**         | Refresh token signing key (≥32 chars and ≠ access secret in production) |
| `JWT_ACCESS_EXPIRES_IN_SECONDS` | `900`                | Access token TTL (15 min)      |
| `JWT_REFRESH_EXPIRES_IN_SECONDS`| `604800`             | Refresh token TTL (7 days)     |
| `DB_HOST`                       | `localhost`          | PostgreSQL host                |
| `DB_PORT`                       | `5432`               | PostgreSQL port                |
| `DB_USERNAME`                   | `rental_user`        | PostgreSQL user                |
| `DB_PASSWORD`                   | `rental_pass`        | PostgreSQL password            |
| `DB_NAME`                       | `rental_db`          | PostgreSQL database            |
| `SEED_ADMIN_EMAIL`              | —                    | Optional: seed creates this platform_admin |
| `SEED_ADMIN_PASSWORD`           | —                    | Optional: its password (8–72 chars) |

All variables are validated at startup by `src/config/env.validation.ts`.

---

## Progress Tracker

### ✅ Done

- [x] Project scaffolded with NestJS CLI
- [x] `AuthModule` with JWT access + refresh token issuance
- [x] Token rotation on refresh (single-use sessions)
- [x] Logout (invalidates refresh session)
- [x] Refresh sessions persisted in `refresh_token_sessions` (SHA-256 hash, single-use rotation, revoke on logout)
- [x] Real credential-based login (bcrypt) + `POST /auth/register`
- [x] Roles/permissions loaded from DB at login and on refresh
- [x] Env validation at startup (`src/config/env.validation.ts`)
- [x] `InitialSchema` migration + seed (roles, permissions, mapping, optional admin)
- [x] `.env.example`, `docker-compose.yml`
- [x] Unit tests for `AuthService`, `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`; e2e auth flow
- [x] `JwtStrategy` (passport-jwt) mapping token payload → `AuthenticatedUser`
- [x] Global `JwtAuthGuard` with `@Public()` opt-out, ordered before the RBAC guards
- [x] Global `RolesGuard` (checks global + organization-scoped roles from JWT)
- [x] Global `PermissionsGuard` (checks fine-grained permissions from JWT)
- [x] `@RequireRoles()`, `@RequirePermissions()`, `@CurrentUser()` decorators
- [x] `GlobalRole` and `OrganizationRole` enums
- [x] `Permissions` string constants (all 10 permission keys)
- [x] `GET /users/me` endpoint
- [x] `GET /users` admin stub (JWT + role + permission guarded)
- [x] TypeORM entity definitions:
  - [x] `users`
  - [x] `organizations`
  - [x] `organization_memberships`
  - [x] `organization_membership_roles`
  - [x] `roles`
  - [x] `permissions`
  - [x] `role_permissions`
  - [x] `user_global_roles`
  - [x] `refresh_token_sessions`
- [x] Global `ValidationPipe` (`whitelist: true`, `transform: true`)

---

### 🔴 Missing / Not Yet Implemented

#### Infrastructure
- [ ] Run `InitialSchema` against a real database (generated offline, not yet applied)

#### Auth
- [ ] Rate limiting / throttling on `POST /auth/register` and `/auth/login`

#### Users Module
- [ ] Wire `UserEntity` via `TypeORM` repository
- [ ] Implement real `listForAdministration()` with DB query
- [ ] `GET /users/:id` — get user by ID
- [ ] `PATCH /users/:id` — update user
- [ ] `DELETE /users/:id` — deactivate/delete user
- [ ] `POST /users` — admin create user

#### Organizations Module
- [ ] Create `OrganizationsModule`, `OrganizationsController`, `OrganizationsService`
- [ ] `POST /organizations` — create organization
- [ ] `GET /organizations` — list organizations
- [ ] `GET /organizations/:id` — get organization
- [ ] `PATCH /organizations/:id` — update organization
- [ ] `DELETE /organizations/:id` — delete organization
- [ ] `POST /organizations/:id/members` — invite/add member
- [ ] `GET /organizations/:id/members` — list members
- [ ] `PATCH /organizations/:id/members/:userId` — update member role
- [ ] `DELETE /organizations/:id/members/:userId` — remove member

#### Properties Module
- [ ] `PropertyEntity` — define DB schema
- [ ] `PropertiesModule`, `PropertiesController`, `PropertiesService`
- [ ] `POST /organizations/:orgId/properties`
- [ ] `GET /organizations/:orgId/properties`
- [ ] `GET /organizations/:orgId/properties/:id`
- [ ] `PATCH /organizations/:orgId/properties/:id`
- [ ] `DELETE /organizations/:orgId/properties/:id`

#### Leases Module
- [ ] `LeaseEntity` — define DB schema (tenant, property, start/end date, rent amount)
- [ ] `LeasesModule`, `LeasesController`, `LeasesService`
- [ ] CRUD endpoints under `/organizations/:orgId/leases`
- [ ] Lease status tracking (active, expired, terminated)

#### Payments Module
- [ ] `PaymentEntity` — define DB schema (lease, amount, due date, paid date, status)
- [ ] `PaymentsModule`, `PaymentsController`, `PaymentsService`
- [ ] CRUD endpoints under `/organizations/:orgId/payments`
- [ ] Payment status tracking (pending, paid, overdue)

#### RBAC (DB-backed)
- [ ] Org-scoped permission checks (flat `permissions[]` only covers global roles)
- [ ] Admin endpoints to manage roles (`GET/POST/DELETE /roles`)
- [ ] Admin endpoints to manage permissions (`GET /permissions`)
- [ ] Admin endpoints to assign roles to users globally
- [ ] Admin endpoints to assign roles to organization members

#### Developer Experience
- [ ] Swagger / OpenAPI setup (`@nestjs/swagger`)

---

## Known Issues / Design Notes

> **Org-scoped permissions** — Token `permissions[]` is built from global roles only. Including org-role permissions in a flat list would leak them across organizations, so Phase 3 has to decide how `@RequirePermissions` works per org.

> **No `SharedModule`** — The `shared/` directory has no `@Module()` class. Guards are registered directly in `AppModule`. A `SharedModule` should be created when the shared layer grows.
