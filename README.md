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
exitPrice,exitDate,commissions,fees,setup,notes
```

Example row:

```text
AAPL,LONG,10,175.50,2026-04-01T09:30:00.000Z,182.25,2026-04-02T15:30:00.000Z,0.75,0.50,Breakout,Strong follow-through
```

## Authentication

Pass the JWT token in the `Authorization` header:

```text
Bearer <token>
```

## Tax Reports

The `Tax reports` area imports broker trade-history files and generates German tax-support documentation for a private individual trading US stocks through a foreign broker. It runs locally in this application and does not send broker statements to an external AI provider.

### Supported Broker Format

The first importer is built for the supplied completed round-trip trade-history workbook:

```text
21924-2026-06-01-to-2026-06-29-trades.xls
```

Supported input containers:

```text
.csv, .xls, .xlsx
```

The importer detects the file signature where practical. The sample `.xls` file is an old binary Excel/OLE workbook. Password-protected or malformed legacy files are rejected with a clear message; convert them with LibreOffice headless mode if needed:

```bash
libreoffice --headless --convert-to xlsx --outdir ./converted ./statement.xls
```

Relevant broker columns:

```text
Opened, Closed, Held, Symbol, Type, Entry, Exit, Qty, Gross, Comm,
Ecn Fee, SEC, ORF, CAT, TAF, OCC, NSCC, Acc, Clr, Misc, Net
```

The parser ignores:

```text
date separator rows, repeated header rows, blank rows, Equities subtotal rows
```

For this broker format each accepted row is treated as one completed intraday long stock round-trip trade. FIFO matching is intentionally not applied to this format because the file already contains closed round trips with entry price, exit price and quantity.

### Normalized Mapping

- `Opened` -> `opened_at`
- `Closed` -> `closed_at`
- `Held` -> `holding_duration`
- `Symbol` -> `symbol`
- `Type` -> `direction`, currently only `Long`
- `Entry` -> `entry_price_usd`
- `Exit` -> `exit_price_usd`
- `Qty` -> `quantity`
- `Gross` -> broker gross P/L in USD
- `Comm` and all fee columns -> direct transaction fees in USD
- `Net` -> broker net P/L in USD

Calculated values:

```text
acquisition_value_usd = entry_price_usd * quantity
disposal_value_usd = exit_price_usd * quantity
calculated_gross_pnl_usd = disposal_value_usd - acquisition_value_usd
total_fees_usd = Comm + Ecn Fee + SEC + ORF + CAT + TAF + OCC + NSCC + Acc + Clr + Misc
calculated_net_pnl_usd = calculated_gross_pnl_usd - total_fees_usd
```

The broker-provided `Gross` and `Net` values are preserved. Independently calculated values are compared against them with the configured tolerance. Rows above tolerance are flagged for review.

### Exchange Rates

The application uses the existing market-data FX API (`/api/market-data/fx-rates`) to fetch and cache USD/EUR rates automatically. The internal rate convention is:

```text
1 USD = X EUR
EUR amount = USD amount * USD/EUR rate
```

Fetched rates store date, value, convention, source name and import timestamp. For a missing non-business date the default rule uses the most recent previous available rate and marks the fallback in audit/report data. The app does not invent or hard-code rates.

The manual CSV importer remains available as a fallback API path. Its CSV columns are:

```text
date,usd_eur
2026-06-02,0.8765
```

### German Tax Model

The report category is:

```text
Gains and losses from the disposal of shares / Aktienveraeusserungsgewinne und -verluste
```

The app calculates reportable transaction totals, not final tax liability. It does not apply the Sparer-Pauschbetrag and does not calculate income tax, solidarity surcharge or church tax.

### Exports

The report workflow can download:

- German PDF report
- XLSX workbook
- normalized ledger CSV
- ZIP evidence package containing PDF, XLSX, CSVs, reconciliation JSON, import log, original uploaded file and a SHA-256 manifest

### Fixture Test

Run the supplied fixture parser/calculation test:

```bash
npm run test:tax-report -- /Users/szy/Downloads/21924-2026-06-01-to-2026-06-29-trades.xls
```

Expected fixture characteristics:

```text
86 valid long trade rows
33 distinct symbols
3,080 shares
Broker gross result about USD -201.405
Total fees about USD 30.7797
Broker net result about USD -232.1847
```

These values are test expectations only. Production import recalculates them from the uploaded file.

### Local Development

Backend:

```bash
npm install
npm run prisma:generate
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Build frontend:

```bash
cd frontend
npm run build
```

### Limitations

- Initial importer supports completed long stock round-trip rows only.
- Short trades, raw executions, options, futures, CFDs, crypto, dividends and corporate actions are rejected or require a future importer.
- Exchange rates must come from an uploaded/verifiable official table or a configured provider; the app does not fabricate missing rates.
- Legal treatment that is uncertain is labelled for review.

### Tax Disclaimer

This report is a technical calculation based on broker data and settings provided by the user. It is not an official tax certificate and does not constitute tax or legal advice. The report should be reviewed by the taxpayer or a qualified German tax adviser before submission.
