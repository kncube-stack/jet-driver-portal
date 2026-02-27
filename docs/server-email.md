# Server-side request email delivery

The portal now sends leave and shift-swap requests through a server endpoint instead of `mailto:`.

## Routes
- `POST /api/auth-login` (server-side PIN verification, returns signed session token)
- `POST /api/auth-session` (verifies existing session token)
- `POST /api/send-request` (requires bearer token)

## Routing rules
- `kind: "leave"` -> `errol@jasonedwardstravel.co.uk`
- `kind: "swap"` -> `operations@jasonedwardstravel.co.uk`

## Required Vercel environment variables
- `RESEND_API_KEY`
- `PORTAL_EMAIL_FROM` (example: `JET Driver Portal <no-reply@yourdomain.com>`)
- `AUTH_SIGNING_SECRET` (long random secret used to sign session tokens)

## Notes
- The endpoint uses the Resend API from the server side.
- If env vars are missing, the app shows an inline send error instead of opening the user email app.
- Drivers cannot submit leave/swap on behalf of another name; managers can.
