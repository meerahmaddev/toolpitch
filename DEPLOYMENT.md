# Pre-deployment checklist

Two services get deployed, in this order: the Python microservice first (Next.js needs its
URL at runtime), then the Next.js app on Vercel.

## 1. Python microservice

This is a separate project from this repo. It's **required**, not optional — LibreOffice
and Ghostscript cannot run inside a Vercel serverless function (a full install is
300MB-1GB+; Vercel caps a function's deployment size at 250MB), so every conversion that
needs them runs here instead:

- `word-to-pdf`, `excel-to-pdf`, `ppt-to-pdf` (LibreOffice headless)
- `compress-pdf`, PDF thumbnails, Office-document thumbnails (Ghostscript / PyMuPDF)
- `pdf-to-word`, `pdf-to-excel`, `pdf-to-ppt`, `pdf-to-images` (pdf2docx / pdfplumber / PyMuPDF)
- text-to-speech, speech-to-text (edge-tts / faster-whisper)

**Deploy it as its included `Dockerfile`** — it installs LibreOffice and Ghostscript via
`apt-get`, which is what makes this all work (no manual binary hunting, no unverified
internet downloads). Any host that runs a Dockerfile works: Railway, Render, Fly.io, a VM,
etc. Steps are the same on all of them:

1. Point the host at the microservice's project directory (it'll find the `Dockerfile`
   automatically on Railway/Render; other hosts may want `docker build -t convertify-python .`
   run from that directory).
2. Give it enough memory — faster-whisper's model plus LibreOffice's runtime want at least
   1-2GB, not the smallest free tier. It runs with 1 `uvicorn` worker by default (safe for
   small hosts, and concurrent requests are still handled without blocking each other —
   see `run_in_threadpool` usage in `main.py`). Once traffic grows and the host has RAM to
   spare, raise it by setting `UVICORN_WORKERS` (e.g. `2`) — no code change needed, but note
   each additional worker loads its own full copy of the Whisper model into RAM, so this
   multiplies memory use.
3. Set `PYTHON_SERVICE_SECRET` on this host to a random string — every `/convert/*`
   endpoint rejects requests that don't carry it (as `Authorization: Bearer <value>`),
   so anyone who can route to this service's public URL directly can't call it for free
   and skip the rate limiting that otherwise only runs in the Next.js route handlers.
   Give the Next.js app the exact same value (see the env var table below) or every
   conversion request will start failing with 401s once this is set.
4. Deploy and note its public URL (e.g. `https://convertify-python.up.railway.app`).
5. Sanity check: `curl https://<that-url>/` should return
   `{"message": "Python Microservice is running!"}`.

## 2. Next.js app (Vercel)

### Environment variables (Vercel project settings → Environment Variables)

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas (or any reachable MongoDB), not `127.0.0.1` |
| `JWT_SECRET` | random string, different from the `.env.local` dev value |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | from Cloudinary dashboard |
| `GOOGLE_CLIENT_ID` | server-side OAuth client id |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_API_KEY` | client-side; also add the deployed domain to the OAuth consent screen's authorized origins |
| `SMTP_USER` / `SMTP_PASS` | OTP emails; without these, OTPs only log to console (fine for testing, not for real users) |
| `PYTHON_SERVICE_URL` | the public URL from step 1 above — **do not** leave this as `localhost` |
| `PYTHON_SERVICE_SECRET` | must exactly match the value set on the Python microservice host in step 3 above |
| `CRON_SECRET` | random string; Vercel sends it as `Authorization: Bearer <value>` to `/api/cron/cleanup` automatically once set |

`GHOSTSCRIPT_PATH` / `LIBREOFFICE_PATH` are **not** needed on Vercel — those only apply to
the Python microservice, and only if you need to point it at non-default binary locations.

### Known platform limits to check against your plan

- **Cron frequency**: `vercel.json` schedules `/api/cron/cleanup` hourly. Vercel's Hobby
  (free) plan only allows daily cron invocations — it will silently run once/day instead of
  hourly. Upgrade to Pro if hourly cleanup matters, or accept the daily fallback.
- **Function duration**: heavy routes already set `export const maxDuration = 60` (upload,
  compress-pdf, merge/split-pdf, etc.). Confirm your plan allows 60s functions (Hobby
  supports this; just don't raise it further without checking Pro/Enterprise limits).

### Deploy

1. Push this repo to GitHub (or your chosen Git provider).
2. Import the project in Vercel, set the env vars above, deploy.
3. Vercel builds with `next build` — no custom build command or binary-fetch step needed;
   the app has no native-binary dependency of its own.

## 3. Post-deploy smoke test

Run through each conversion family once on the live URL — these are the ones that only
work end-to-end once `PYTHON_SERVICE_URL` is correctly wired up:

- [ ] `word-to-pdf`, `excel-to-pdf`, `ppt-to-pdf`
- [ ] `compress-pdf`
- [ ] `pdf-to-word`, `pdf-to-excel`, `pdf-to-ppt`, `pdf-to-images`
- [ ] Upload a PDF/Office file in the Workspace and confirm its thumbnail renders
- [ ] Text-to-speech, speech-to-text

If the Python microservice is unreachable, these return a `503` with a plain
"conversion service is temporarily unavailable" message rather than crashing — if you see
that, re-check `PYTHON_SERVICE_URL` and that the microservice is actually running.
