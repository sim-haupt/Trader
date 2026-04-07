# Trader Backend

Backend API for a trading journal web app built with Node.js, Express, Prisma, Supabase Postgres, and JWT authentication.

## Features

- User registration and login
- JWT-protected trade endpoints
- Trade CRUD APIs
- CSV import for trades with row-level validation
- Prisma ORM with Supabase Postgres
- Modular structure using controllers, services, routes, and middleware

## Project Structure

```text
src/
  config/
  controllers/
  middleware/
  routes/
  services/
  utils/
prisma/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Create a Supabase project and open its database connection settings.

4. Update `.env` with:

- `DATABASE_URL`: the pooled Supabase connection string for runtime
- `DIRECT_URL`: the direct database connection string for Prisma migrations
- `JWT_SECRET`: your application JWT secret

Example:

```env
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
JWT_SECRET="replace_with_a_long_random_secret"
JWT_EXPIRES_IN="7d"
```

5. Generate the Prisma client:

```bash
npm run prisma:generate
```

6. Run the database migration:

```bash
npm run prisma:migrate -- --name init
```

7. Start the development server:

```bash
npm run dev
```

Server base URL:

```text
http://localhost:5000/api
```

## Supabase Notes

- Supabase is PostgreSQL under the hood, so the Express and Prisma application code stays the same.
- Use the pooled connection for app traffic and the direct connection for Prisma migration workflows.
- This backend keeps custom JWT auth in Express; it does not use Supabase Auth.

## Auth Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`

## Trade Endpoints

- `POST /api/trades`
- `GET /api/trades`
- `PUT /api/trades/:id`
- `DELETE /api/trades/:id`
- `POST /api/trades/import`

## CSV Import Format

Required headers:

```text
symbol,side,quantity,entryPrice,entryDate
```

Optional headers:

```text
exitPrice,exitDate,fees,strategy,notes
```

Example row:

```text
AAPL,LONG,10,175.50,2026-04-01T09:30:00.000Z,182.25,2026-04-02T15:30:00.000Z,1.25,Breakout,Strong follow-through
```

## Authentication

Pass the JWT token in the `Authorization` header:

```text
Bearer <token>
```
