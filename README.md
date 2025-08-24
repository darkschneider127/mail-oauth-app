# Google Mail OAuth Starter — Render-ready

Minimal Node + Express app for Google OAuth (Gmail).

Features:
- Google OAuth 2.0 with `gmail.readonly` scope.
- Refresh tokens stored in PostgreSQL (so you can use longer than 1 hour).
- `/auth/google` → start OAuth flow.
- `/auth/google/callback` → handle callback, store tokens.
- `/api/emails/latest?userId=demo-user` → fetch latest emails (including bodies).

## Setup

1. In Google Cloud Console:
   - Create OAuth Client ID (Web application).
   - Redirect URI: `https://YOURAPP.onrender.com/auth/google/callback`
   - Enable Gmail API in APIs & Services.
   - Scope: `https://www.googleapis.com/auth/gmail.readonly`

2. On Render:
   - Create Web Service from this repo.
   - Add PostgreSQL DB (Render injects `DATABASE_URL`).
   - Add Environment variables (see `.env.example`).

3. Done! Visit `/` to test login with Google.

## Security

- Tokens stored in Postgres (refresh tokens included).
- Consider encrypting secrets at rest.
- Always use HTTPS in production (Render gives you TLS).

