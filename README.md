# Operations Hub

A single internal application for KYC review, controlled Stripe refunds, and environment-isolated feature flags.

## Product behavior

- One company-auth integration boundary and one shared session.
- Server-enforced capabilities hide and protect unauthorized modules.
- KYC queue with self-claim, claim-gated PII, Stripe Identity references, and two-person review for rejection or high-risk approval.
- Full-refund-only Stripe workflow with a configurable `$100 USD` approval threshold.
- Stable Stripe idempotency key per immutable internal refund request.
- Boolean feature flags with independent rollout percentages for Development, Staging, and Production.
- Feature Flag creation requires explicit environment selection.
- Production Feature Flag changes require a reason and record before/after audit values.
- Audit Officers receive masked KYC/Refund access and no Feature Flag access.
- Super Admin can access every module.

## Architecture

```text
frontend/                  React 19 + TypeScript + Vite
backend/                   FastAPI + SQLAlchemy
deployment/nginx/          Same-origin reverse proxy
docker-compose.yml         PostgreSQL + API + web
```

SQLite is the zero-configuration local default. Docker Compose uses PostgreSQL 16.

## Local development

Requirements:

- Node.js `>=22.12`
- Python `>=3.11`

Install dependencies:

```bash
npm install
npm --prefix frontend install
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Run both services:

```bash
npm run dev
```

Open `http://localhost:5173`.

The default `AUTH_MODE=demo` exposes local fixture identities for each role. Production should use `AUTH_MODE=company_headers` behind the company's trusted authentication proxy, which must supply:

```text
X-Company-User-Id
X-Company-User-Email
```

Fixture identities are never used in `company_headers` mode.

The demo login is passwordless. Choose one of these seven cards:

| Account | Email | Access |
| --- | --- | --- |
| Super Admin | `superadmin@ops.local` | All modules |
| KYC Admin | `kyc.admin@ops.local` | KYC administration and second review |
| KYC User | `kyc.user@ops.local` | KYC queue and standard review |
| Refund Admin | `refund.admin@ops.local` | Refund approval, execution, and reconciliation |
| Refund User | `refund.user@ops.local` | Refund requests and standard execution |
| Feature Flags Admin | `flags.admin@ops.local` | All Feature Flag environments |
| Feature Flags User | `flags.user@ops.local` | Non-Production Feature Flag editing |

## Docker

```bash
docker compose up --build
```

Open `http://localhost:8080`.

## Stripe

Without `STRIPE_SECRET_KEY`, refund execution uses a deterministic local Stripe mock and still exercises approval, idempotency, persistence, and audit behavior.

With Stripe test credentials:

```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_WEBHOOK_SECRET=whsec_...
```

The backend calls Stripe directly. It creates one stable idempotency key from the immutable internal refund request and reuses the same key for retries.

Partial refunds are not accepted. The backend derives the refund amount from the captured payment and does not send a user-entered amount.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test
```
