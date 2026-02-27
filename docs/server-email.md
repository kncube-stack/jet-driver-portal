# Server-side request email delivery

The portal now sends leave and shift-swap requests through a server endpoint instead of `mailto:`.

## Route
- `POST /api/send-request`

## Routing rules
- `kind: "leave"` -> `errol@jasonedwardstravel.co.uk`
- `kind: "swap"` -> `operations@jasonedwardstravel.co.uk`

## Required Vercel environment variables
- `RESEND_API_KEY`
- `PORTAL_EMAIL_FROM` (example: `JET Driver Portal <no-reply@yourdomain.com>`)

## Notes
- The endpoint uses the Resend API from the server side.
- If env vars are missing, the app shows an inline send error instead of opening the user email app.
