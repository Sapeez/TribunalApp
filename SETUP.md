# Setup — where your OpenRouter key actually goes

You already have an OpenRouter key. Here's exactly where it goes and when — **never paste the
real key into chat with Claude, a doc, or anything that gets committed to git.** It only ever goes
into these two places:

## 1. Local development (while we're building/testing on your machine)

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your key after the `=`:

```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxx
```

`.env.local` is already listed in `.gitignore` — git will never see it, never commit it, never
push it anywhere. This is the only file on your machine that should ever contain the real key.

## 2. Production (once deployed to Vercel)

Real keys never go in a file that ships with the site — they go in Vercel's own environment
variable store:

1. Vercel dashboard → your project → **Settings → Environment Variables**
2. **Add** → Key: `OPENROUTER_API_KEY`, Value: your real key, Environment: Production (and
   Preview if you want preview deploys to work too) → Save
3. Repeat for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` once the Supabase project exists

Vercel injects these into the serverless functions at runtime; they're never bundled into the
browser-facing JavaScript (the whole point of keeping OpenRouter calls server-side —
`lib/openrouter/client.ts` is the only file that reads `OPENROUTER_API_KEY`, and it's never
imported from anything marked `"use client"`).

## Verifying it's the right key

If you're not sure which key is current or want to see/rotate it: openrouter.ai → **Settings →
Keys**. This app reads whatever's in `OPENROUTER_API_KEY` at the time each request runs, so
rotating the key on OpenRouter's side just means updating it in Vercel's environment variables
(or `.env.local` locally) — nothing in the code changes.

## Where this is checked in code

`lib/openrouter/client.ts`'s `getOpenRouterClient()` reads `process.env.OPENROUTER_API_KEY` once
and throws a clear error (naming this file) if it's missing — so a misconfigured deploy fails
loudly at first use, not with a confusing downstream error.
