# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm install
npm run start:dev       # Run with hot-reload (NestJS watch mode)
npm run start           # Run without watch
```

### Build
```bash
npm run build           # tsc + tsc-alias (resolves path aliases in dist/)
```

### Database Migrations
```bash
npm run migration:generate --name=<MigrationName>   # Generate migration from entity changes
npm run migration:run                                # Apply pending migrations
npm run migration:revert                             # Roll back last migration
```

### Seeding
```bash
npx ts-node src/schema/seeds/seed-roles.ts
npx ts-node src/schema/seeds/seed-system-parameters.ts
npx ts-node src/schema/seeds/mock-course-data.ts
ts-node src/schema/seeds/clear-database.ts          # Wipe all data
```

### Docker (local)
```bash
cp .env.example .env    # Configure environment first
docker compose up --build
```

## Architecture

### Framework & Stack
NestJS (v11) with TypeScript, PostgreSQL via TypeORM, JWT auth via `passport-jwt`. There is a single `AppModule` — no feature modules. All controllers, services, and entities are flat arrays imported via barrel files (`src/controllers/index.ts`, `src/services/index.ts`, `src/schema/entities/index.ts`).

### Directory Layout
- `src/controllers/` — HTTP layer only; delegates to services. Split into `admin/`, `student/`, `teacher/` sub-folders for role-scoped routes.
- `src/services/` — All business logic. One service per domain (e.g. `course.service.ts`, `quiz.service.ts`).
- `src/schema/entities/` — TypeORM entity definitions (PostgreSQL).
- `src/schema/dtos/` — DTOs validated with `class-validator`.
- `src/schema/migrations/` — TypeORM migration files; datasource config is `src/schema/datasource.ts`.
- `src/common/` — Cross-cutting concerns:
  - `guards/` — `JwtAuthGuard` (global, uses `@Public()` decorator to opt-out), `RolesGuard` (use `@Roles(SystemRole.ADMIN)` decorator).
  - `interceptors/` — `ResponseInterceptor` wraps all responses as `{ status, message, data }`. `ApiLogInterceptor` records every request to the DB.
  - `filters/` — `AllExceptionsFilter` for uniform error responses.
  - `decorators/` — `@Public()` to bypass JWT guard.
- `src/config/typeorm.config.ts` — DB connection. `synchronize: false`; always use migrations.
- `src/constants/` — Shared enums, response messages, storage keys.
- `src/utils/` — Standalone utilities: `cosine-similarity.ts`, `jaro-winkler.ts`, `mastery-calculator.ts`, `excel-question-parser.ts`.

### Base Response Rules
- The API always returns HTTP 200 to clients. Do not use the HTTP status code as the client-facing success/error signal.
- For thrown `HttpException`s, `AllExceptionsFilter` keeps HTTP 200 and puts the real error status in the response body (`status`), with `message` and `data`.
- For normal business responses, follow the existing controller convention: return an object shaped like `{ code, message, data }` (plus pagination/metadata when the nearby API already does so).
- Do not invent new response shapes for a single endpoint. Match the closest existing API in the same controller/domain.
- For delete/update actions, prefer a meaningful Vietnamese `message` and set `data: null` when there is no payload to return.

### Authentication & Authorization
- JWT access tokens (15 min expiry) + refresh tokens stored in DB (`RefreshToken` entity).
- All routes are protected by `JwtAuthGuard` globally. Annotate public endpoints with `@Public()`.
- Role-based access uses `@Roles(SystemRole.ADMIN | TEACHER | STUDENT)` + `RolesGuard` applied per controller/handler.
- Google OAuth via `google-auth-library` (`GoogleAuthService`).
- System roles: `student`, `teacher`, `admin`, `guest` (enum `SystemRole` in `role.entity.ts`).

### Key Domain Concepts

**Course lifecycle with pending changes**: Teachers submit changes via `PendingChange` entity rather than editing courses directly. `PreModerationEngine` auto-validates (bad words, duplicate content via TF-IDF cosine similarity + Jaro-Winkler, rate limiting) before admin approval. Risk scoring also informs the moderation flow.

**AI/RAG pipeline**: `RagService` runs a scheduled job (configurable via `system_parameters` table: `IS_SCHEDULE`, `RAG_SCHEDULE`, `JOB_LIMIT`) that fetches `ContentFile` records with `status_chunks = NEW`, sends them to an external transcription API (`https://rag.nguyenduc.click/transcribe`), and stores resulting chunks + vector embeddings in `transcript_chunks` table.

**AI Chat**: `ChatService` supports three modes:
1. Simple chat via Gemini API (`API_KEY_GEMINI`)
2. Public chat via a separate Gemini key (`API_KEY_GEMINI_PUB`)
3. Context-aware AI chat routed to a custom AI service (`AI_CHAT_BASE_URL` system parameter) or falls back to Gemini. Sessions and messages are persisted.

**Course recommendation**: `RecommendationService` implements a hybrid engine — TF-IDF content-based filtering + Jaccard-similarity collaborative filtering — blended with a configurable weight (default 70% content, 30% collab). Falls back to popular/latest courses for cold-start users.

**Adaptive learning (mastery)**: `MasteryService` initialises a `UserContentMastery` record per content item on payment, tracking a `theta` (IRT-style ability estimate) and `certainty`. `MasteryCalculator` (util) updates these after quiz submissions. Content prerequisites are modelled as a knowledge graph (`ContentRelationship` entity).

**Payments**: VNPay integration via `vnpay` package (`VnpayService`). Payment callback triggers `MasteryService.setupData()` and course registration.

**Storage**: Azure Blob Storage via `@azure/storage-blob`. `StorageService` generates time-limited SAS URLs for media access.

**System parameters**: `SystemParameterService` provides a cached key-value store backed by the `system_parameters` table. Used to configure AI endpoints, RAG scheduling, chat model parameters, etc. — without redeployment.

### Path Aliases
`tsconfig.json` maps `src/*` → `./src/*`. Use `src/...` imports, not relative `../../` chains. After `tsc` build, `tsc-alias` rewrites these for the CommonJS output in `dist/`.

### Environment Variables
Copy `.env.example` to `.env`. Key variables:
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` — PostgreSQL connection
- `JWT_SECRET` — JWT signing key
- `GOOGLE_CLIENT_ID` — Google OAuth
- `API_KEY_GEMINI`, `API_KEY_GEMINI_PUB` — Gemini AI keys
- `AZURE_ACCOUNT_NAME`, `AZURE_ACCOUNT_KEY`, `CONTAINER_NAME` — Azure Blob Storage
- `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, `VNPAY_RETURN_URL` — VNPay
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — Email (Brevo SMTP)
- For Docker local dev, set `DB_HOST=host.docker.internal`
