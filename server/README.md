# Universal POS: server (Phases 1 and 2)

Node + Express + PostgreSQL. Also serves the `client` folder, so the app and API share one address.

## What exists so far
- Database migration 001: organisations, branches, registers, users, roles, permissions, categories, products (with image), stock balances and movements, audit logs, idempotency keys, sessions.
- Login / logout / me with secure cookie sessions, login rate limit, role permissions, same-origin check.
- Products (list, search, create, edit) and inventory (adjust, receive, movement history). Stock changes use one transaction and a row lock.
- Seed data: Demo Shop, manager and cashier logins, 12 products with opening stock.
- Migration 002 (Phase 2): sales, items, payments, shifts, refunds, receipt numbers, clients table.
- Checkout `POST /sales`: server-side prices, locked stock, idempotency key, split cash/M-Pesa/card, 5% cashier discount limit, one M-Pesa code per sale, gapless receipt numbers, all in one transaction.
- Shifts (`/registers/:id/shifts/...`), refunds (`/sales/:id/refunds`, manager only, restocks), `GET /reports/sales`.
Next: purchasing and clients (migration 003), staff admin and reports, then switch the frontend to the real API.

## Setup (Windows PowerShell)
1. Install PostgreSQL 13 or newer (https://www.postgresql.org/download/windows/). Remember the `postgres` password. Keep port 5432.
2. In this folder:
       npm install
       copy .env.example .env
   Open `.env`: put your postgres password in DATABASE_URL, and set SESSION_SECRET using
       node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
3. Create, build and fill the database:
       npm run db:create
       npm run migrate
       npm run seed
4. Start the server:  `npm run dev`   (open http://localhost:4000)
5. In a second PowerShell window in this folder:
       npm run test:pricing     (money rules, no database needed)
       npm run smoke            (login, products, stock)
       npm run smoke:sales      (shifts, checkout, refunds, simultaneous sales)
   If you already ran migrate and seed for Phase 1, just run `npm run migrate` again to add Phase 2.

Note: the screens still use demo data until all phases are done (`USE_MOCK` stays true in client/js/api.js).
