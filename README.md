# 50 of 50

This is a Node/Express site with a static frontend, Stripe Checkout payments, SQLite storage, and certificate email delivery.

## What Is Running
- Frontend pages are served directly by the Node server.
- The live backend entry point is `server.cjs`.
- Stripe Checkout is created server-side.
- Payment state is stored in `users.db`.
- Certificates are generated with PDFKit and emailed with SMTP.

## Local Start
1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in the real values.
3. Start the app with `npm start`.
4. Open `http://localhost:3001`.

## Required Environment Variables
- `PORT` — server port. Use the port provided by the host in production.
- `APP_URL` — the public site URL, for example `https://50of50.com`.
- `DATA_DIR` — directory where `users.db` should live. On Render, use `/var/data`.
- `VIDEO_BASE_URL` — optional public base URL for hosted movement videos. Example: `https://cdn.example.com`.
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `FROM_EMAIL`
- `CONTACT_TO_EMAIL` — optional destination for homepage contact messages. Defaults to `FROM_EMAIL`, then `SMTP_USER`.
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CURRENCY` — currently `aud`.
- `CHALLENGE_PRICE_CENTS` — currently `1500` for AUD $15.00.

## Video Hosting
The movement videos are too large to keep in the current Render/GitHub deployment flow. The app supports hosting them externally.

How it works:
- Keep the existing paths in `challenge.json` and `demo-challenge.json`, such as `assets/videos/no.1pushup.mp4`.
- Upload the same folder structure to a public storage location.
- Set `VIDEO_BASE_URL` to that storage base URL.
- The site will request videos from `${VIDEO_BASE_URL}/assets/videos/...`.

Example:
- `VIDEO_BASE_URL=https://cdn.50of50.com`
- video request becomes `https://cdn.50of50.com/assets/videos/no.1pushup.mp4`

## Stripe Go-Live Checklist
1. In Stripe, activate your account and complete business verification.
2. In Stripe Dashboard, switch from test mode to live mode.
3. Copy your live secret key into `STRIPE_SECRET_KEY`.
4. Keep `CHALLENGE_PRICE_CENTS=1500` unless you are changing the event price.
5. Set `APP_URL=https://50of50.com`.
6. Add a webhook endpoint in Stripe:
	 `https://50of50.com/api/stripe/webhook`
7. Subscribe the webhook to:
	 `checkout.session.completed`
	 `checkout.session.async_payment_succeeded`
8. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
9. Run one live payment with a real low-value card payment and verify:
	 - Stripe redirects to `https://50of50.com/payment-success.html`
	 - `/api/payments/status` shows the entry as paid
	 - the challenge unlocks for that account
	 - completing or forfeiting the challenge consumes the entry

## Hosting Advice For 50of50.com
The easiest reliable production setup is:
- Host the Node app on a Node-friendly service or VPS.
- Point `50of50.com` and `www.50of50.com` to that app.

## Render Deployment
This repo now includes a `render.yaml` blueprint for Render.

### Recommended Render setup
- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Persistent disk mount path: `/var/data`

### Render steps
1. Push this repo to GitHub.
2. In Render, choose `New +` then `Blueprint`.
3. Select the GitHub repo.
4. Render will detect `render.yaml`.
5. Fill in these environment variables in Render:
	- `APP_URL=https://50of50.com`
	- `DATA_DIR=/var/data`
	- `VIDEO_BASE_URL=https://your-public-video-host`
	- `SMTP_HOST`
	- `SMTP_PORT`
	- `SMTP_USER`
	- `SMTP_PASS`
	- `FROM_EMAIL`
	- `CONTACT_TO_EMAIL` (optional, for contact-form messages)
	- `STRIPE_SECRET_KEY`
	- `STRIPE_WEBHOOK_SECRET`
	- `STRIPE_CURRENCY=aud`
	- `CHALLENGE_PRICE_CENTS=1500`
6. After the first deploy, add your custom domain in Render:
	- `50of50.com`
	- `www.50of50.com`
7. In GoDaddy DNS, point the domain records to the Render targets shown in the Render custom domain screen.
8. After DNS is live, set your Stripe webhook endpoint to:
	`https://50of50.com/api/stripe/webhook`
9. Run a full production smoke test.

### Best option if you want the fewest moving parts
- Use a VPS or hosting plan that supports a persistent Node process.
- Run this app directly with Node.
- Put Nginx in front if your host requires reverse proxying.

### Important GoDaddy note
- If your GoDaddy plan is only static hosting, shared hosting, or Website Builder, it is not a good fit for this app because this project needs a running Node server plus SQLite writes.
- If you have a GoDaddy VPS or a cPanel plan with Node app support, you can host it there.
- If you only want to use GoDaddy for the domain, point DNS to a Node host like Render, Railway, Fly.io, or a VPS.

## Fastest Live Path
1. Push this repo to GitHub.
2. Create a Render Blueprint from the repo.
3. Add the production environment variables.
4. Add a persistent disk mounted at `/var/data`.
5. Connect `50of50.com` and `www.50of50.com` in Render.
6. Update GoDaddy DNS to the Render targets.
7. In Stripe, use the same `https://50of50.com` URL for success, cancel, and webhook flows.

## DNS If You Use GoDaddy For The Domain
- If the app is on a VPS with a public IP:
	point the root `A` record to that IP.
- For `www`:
	point `www` to the same destination with `CNAME` or another `A` record depending on the host.
- If the app is on a managed platform:
	use the exact DNS records the platform gives you.

## Before Launch
- Replace all test Stripe keys with live keys.
- Confirm the payment page no longer shows the Stripe test card message on the live domain.
- Remove or avoid using local-only developer bypass flows.
- Back up `users.db` before launch.
- Make sure SMTP credentials are valid and the sender address is verified.

## Production Smoke Test
1. Register a fresh account.
2. Buy one event entry through Stripe.
3. Confirm the payment success page unlocks the challenge.
4. Start the challenge and verify normal routing.
5. Complete one challenge and confirm the certificate email is sent.
6. Confirm a second attempt requires a new payment.
