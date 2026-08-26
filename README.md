# OMSC Guidance System

A web-based guidance and awareness system for the Occidental Mindoro State
College Guidance and Testing Center — an undergraduate capstone project.

## Scope

Built to the requirements set by the thesis panel (Manuel, Pelayo, Usita,
Evaluator 4):

- Knowledge-based dissemination and awareness of guidance programs
- Admin-managed content (programs, IEC materials, surveys)
- A scored knowledge survey measuring student awareness of the programs
- Analytics by program, guidance service, course, year level, gender, age,
  PWD, and IP status
- Generated PDF/Excel reports
- All guidance programs and IEC materials represented in the system
- Multimedia awareness content (video, audio, images, PDFs, links)
- Two roles only: Admin and Student

**8 screens total:**

- **Student:** Dashboard · Programs · IEC Materials · Knowledge Survey · Profile
- **Admin:** Content Management · Analytics · Reports · Users
- **Public:** Home · Programs · Materials · About

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage)
- Express API (`api/index.js`), deployed as a Vercel serverless function
- Recharts for analytics charts; jsPDF / xlsx / file-saver for report exports

## Setup

**Prerequisites:** [Node.js](https://nodejs.org/) installed.

1. Install dependencies:

   ```
   npm install
   ```

2. Create a `.env` file in the project root with the following variables:

   | Variable | Used by |
   |---|---|
   | `VITE_SUPABASE_URL` | Frontend Supabase client |
   | `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client |
   | `SUPABASE_URL` | Backend API (`api/index.js`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Backend API — admin-level Supabase access |
   | `SUPABASE_ANON_KEY` | Backend API — user-level Supabase Auth calls |
   | `ALLOWED_ORIGINS` | Backend API — comma-separated list of origins allowed by CORS (e.g. `http://localhost:5173,https://your-app.vercel.app`) |
   | `PORT` | Backend API local dev port (defaults to `3001`) |

   Never commit `.env` — it holds live Supabase credentials.

3. Apply pending database changes: open `supabase/migrations.sql` and run
   each statement manually in the Supabase SQL Editor, in the order they
   appear in the file. Nothing in that file runs automatically.

4. Run the frontend:

   ```
   npm run dev
   ```

   The app is served at [http://localhost:5173](http://localhost:5173).

5. In a separate terminal, run the backend API (required for
   login/registration — the frontend proxies `/api/*` to it in dev):

   ```
   node api/index.js
   ```

   It listens on `http://localhost:3001` by default.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run typecheck` — run `tsc --noEmit`
- `npm run build` — typecheck, then build for production

## Database

Tables in use: `users`, `profiles`, `programs`, `materials`, `surveys`,
`survey_responses`. `profiles` is the single source of truth for student
demographics (program, year level, age, gender, PWD, IP); `users` holds only
account/access-control fields. See `supabase/migrations.sql` for schema
history and required manual migrations.
