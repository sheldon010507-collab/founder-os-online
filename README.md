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

After adding or changing Vercel environment variables, redeploy the project so the serverless API and Vite build receive the new values.

If another phone or account shows `共享密码不对，或者 Vercel 没配置 FOUNDER_APP_PASSWORD。`:

1. Confirm `FOUNDER_APP_PASSWORD` exists in Vercel for the same environment that user is opening, usually Production.
2. Confirm the password typed on that device exactly matches `FOUNDER_APP_PASSWORD`; spaces and different capitalization count as different passwords.
3. Tap Settings -> clear local password, or reopen the app after the latest deploy. The app now clears a bad saved password automatically after a 401 response.

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
