# Server-side request email delivery

The portal currently uses a mixed model:

- annual leave opens the user's mail app via `mailto:` for pilot testing,
- approved shift swaps are emailed from the server side,
- `POST /api/send-request` still exists for direct server-side request email sends where needed.

## Routes
- `POST /api/auth-login` (server-side PIN verification, returns signed session token)
- `POST /api/auth-session` (verifies existing session token)
- `POST /api/send-request` (requires bearer token)

## Routing rules
- leave mail drafts target `errol@jasonedwardstravel.co.uk`
- timesheet mail drafts target `errol@jasonedwardstravel.co.uk`
- `kind: "leave"` -> `errol@jasonedwardstravel.co.uk`
- `kind: "swap"` -> `operations@jasonedwardstravel.co.uk`

## Required Vercel environment variables
- `RESEND_API_KEY`
- `PORTAL_EMAIL_FROM` (example: `JET Driver Portal <no-reply@yourdomain.com>`)
- `AUTH_SIGNING_SECRET` (long random secret used to sign session tokens)

## Notes
- The endpoint uses the Resend API from the server side.
- The main live server-side email use today is the approved-swap workflow.
- Drivers cannot submit leave/swap on behalf of another name; managers can.
