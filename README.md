# Founder OS Online Dashboard

Founder OS is now an online-first Vite + Vercel app.

The homepage is `Capture`: type a message, paste links, upload images/files, and the Vercel API writes the result to Supabase. The local OpenClaw gateway and Telegram bot are no longer required for the main workflow.

## Local

```bash
npm install
npm run dev
```

Open `http://localhost:5174`.

## Vercel Environment Variables

Frontend-safe values:

```bash
VITE_FOUNDER_SUPABASE_URL=
VITE_FOUNDER_SUPABASE_ANON_KEY=
```

Server-only values:

```bash
FOUNDER_SUPABASE_URL=
FOUNDER_SUPABASE_SERVICE_ROLE_KEY=
FOUNDER_NVIDIA_API_KEY=
FOUNDER_AI_MODEL=
FOUNDER_APP_PASSWORD=
```

Do not expose `FOUNDER_SUPABASE_SERVICE_ROLE_KEY`, `FOUNDER_NVIDIA_API_KEY`, OpenClaw secrets, Telegram tokens, or kitchen credentials in frontend variables.

## Supabase Setup

Run the SQL in:

```text
supabase/migrations/001_online_capture.sql
```

It creates:

- `founder_capture_messages`
- `founder_capture_assets`
- private Storage bucket `founder-captures`

The migration also enables RLS and explicitly grants Data API access for the new tables, which is required for newer Supabase projects.

## Main Data Model

The official business state still lives in:

- `finance_entries`
- `work_items`
- `activity_log`
- `founder_skill_candidates`

The capture tables are the inbox/history layer. OpenClaw, Telegram, local STT, and invoice tables are not part of this online v1 flow.
