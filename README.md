# Shared Travel Expenses

A Next.js web app (TypeScript) for tracking and splitting expenses on group trips, backed by MongoDB via the native MongoDB driver.

## Features

- Create trips with a list of participants
- Add expenses to a trip (who paid, who owes)
- Automatic balance calculation per trip
- REST API (`/api/trips`, `/api/expenses`) fully powered by MongoDB

## Tech stack

- **Next.js 16** (App Router, Server Components)
- **TypeScript**
- **Tailwind CSS**
- **MongoDB** native driver (`mongodb` npm package — no Mongoose)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your MongoDB connection string:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=shared_travel_expenses   # optional, this is the default
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Reference

### Trips

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trips` | List all trips |
| POST | `/api/trips` | Create a trip |
| GET | `/api/trips/:id` | Get a trip |
| PUT | `/api/trips/:id` | Update a trip |
| DELETE | `/api/trips/:id` | Delete a trip |

### Expenses

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/expenses?tripId=<id>` | List expenses (optionally filtered by trip) |
| POST | `/api/expenses` | Create an expense |
| GET | `/api/expenses/:id` | Get an expense |
| PUT | `/api/expenses/:id` | Update an expense |
| DELETE | `/api/expenses/:id` | Delete an expense |

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── trips/
│   │   │   ├── route.ts          # GET /api/trips, POST /api/trips
│   │   │   └── [id]/route.ts     # GET/PUT/DELETE /api/trips/:id
│   │   └── expenses/
│   │       ├── route.ts          # GET /api/expenses, POST /api/expenses
│   │       └── [id]/route.ts     # GET/PUT/DELETE /api/expenses/:id
│   ├── trips/
│   │   ├── new/page.tsx          # Create new trip form
│   │   └── [id]/
│   │       ├── page.tsx          # Trip detail with expenses & balances
│   │       └── expenses/new/page.tsx  # Add expense form
│   ├── layout.tsx
│   └── page.tsx                  # Home – trip list
├── lib/
│   └── mongodb.ts                # MongoDB client with connection caching
└── types/
    └── index.ts                  # Trip, Expense, Balance TypeScript types
```
