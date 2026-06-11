# Babushka's Family Archive

A personal Storyworth-style app that emails a weekly question to a family member, collects their story through a magic link, and displays all stories in a private family archive.

Stories are editable until the following week's question arrives. The archive is passcode-protected.

---

## How it works

1. Every Monday at midnight UTC (Sunday afternoon in PST), a cron job picks the next question from the database and emails a magic link to the configured address.
2. The recipient clicks the link, writes their story, and hits "Send to the Family."
3. The family receives an email notification and can browse all stories at the archive page.
4. The story stays editable until the following Monday, when the next question locks it.

---

## Setting up from scratch

### 1. Fork and clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/story-worth-clone.git
cd story-worth-clone
npm install
```

---

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New project**. Give it a name, set a database password, and pick a region close to you.
3. Wait for the project to finish provisioning (~1 minute).

#### Create the tables

In your Supabase project, go to **SQL Editor** and run the contents of `db/schema.sql`. This creates the three tables: `questions`, `access_tokens`, and `stories`.

Then run `db/seed.sql` to populate 15 starter questions. You can edit these to suit your family member before sending the first prompt.

#### Get your Supabase credentials

Go to **Project Settings → API**:

- **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
- **service_role** secret (under "Project API keys") → this is your `SUPABASE_SERVICE_ROLE_KEY`

> The app uses the service role key server-side only to bypass Row Level Security. Never expose it in client-side code.

---

### 3. Set up Resend (email sending)

1. Go to [resend.com](https://resend.com) and create a free account.
2. From the dashboard, go to **API Keys → Create API Key**. Give it a name and copy the key — this is your `RESEND_API_KEY`.
#### Resend free tier limitation

The Resend free plan only allows sending to the **single email address you signed up with**. This means `FAMILY_EMAILS` must be set to just your own email — you can't send directly to other family members without upgrading or verifying a domain.

A simple workaround: receive the weekly prompt email yourself, copy the magic link, and forward it to your family member over text or WhatsApp. This is how this app is used in practice — the family member gets the link via text, not email, and replies by text when they're done writing. You can then paste their story into the text box yourself if they're not comfortable with the web interface.

If you verify a custom domain with Resend, you can send to any address and skip the manual forwarding step.

---

### 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Resend
RESEND_API_KEY="re_..."

# The public URL of your deployed app (used in email links)
NEXT_PUBLIC_BASE_URL="https://your-app.vercel.app"

# Comma-separated list of email addresses to notify when a story is submitted
# and to receive the weekly prompt link
FAMILY_EMAILS="you@example.com"

# Passcode to access the family archive page
FAMILY_PASSCODE="choose-something-memorable"

# A secret string used to authenticate the weekly cron job
# Generate one with: openssl rand -hex 32
CRON_SECRET="your-random-secret"
```

---

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll see the passcode gate — enter the value you set for `FAMILY_PASSCODE`.

To test the write page locally without waiting for a cron, manually insert a row into `access_tokens` in the Supabase dashboard:

```sql
INSERT INTO access_tokens (question_id) VALUES (1);
```

Then copy the generated `token` UUID and open `http://localhost:3000/write/<token>`.

To test the cron locally:

```bash
curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/send-prompt
```

---

### 6. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and create an account (free tier is sufficient).
2. Click **Add New → Project**, import your GitHub repository.
3. Vercel will auto-detect Next.js. Leave the build settings as-is and click **Deploy**.

#### Add environment variables

In your Vercel project, go to **Settings → Environment Variables** and add each variable from your `.env.local`:

| Variable | Environment |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development |
| `RESEND_API_KEY` | Production, Preview, Development |
| `NEXT_PUBLIC_BASE_URL` | Production only (set to your `*.vercel.app` URL) |
| `FAMILY_EMAILS` | Production, Preview, Development |
| `FAMILY_PASSCODE` | Production, Preview, Development |
| `CRON_SECRET` | Production, Preview, Development |

After adding variables, trigger a redeploy: **Deployments → your latest deploy → Redeploy**.

#### Weekly cron

The cron job is configured in `vercel.json` to run every Monday at midnight UTC — which is Sunday evening/afternoon in US time zones (5pm PST / 8pm EST). If you want it to arrive Monday morning in your local time, adjust the schedule accordingly:

```json
{ "path": "/api/cron/send-prompt", "schedule": "0 0 * * 1" }
```

For Monday at 9am PST (UTC-8), use `"0 17 * * 1"` (17:00 UTC Monday = 9am PST).

Vercel runs this automatically on Pro plans. On the free Hobby plan, Vercel supports one cron job — this project uses exactly one, so it works on the free tier.

Vercel authenticates the cron by sending `Authorization: Bearer <CRON_SECRET>` with each request. Make sure `CRON_SECRET` is set in your Vercel environment variables.

---

### 7. Running tests

```bash
npm test
```

Tests cover the story submission API, including a schema guard that verifies the correct column names are used in Supabase queries.

---

## Project structure

```
app/
  page.tsx                    # Family archive (passcode-protected)
  write/[token]/page.tsx      # Story write/view page (magic link)
  api/
    stories/submit/route.ts   # POST: submit or edit a story
    cron/send-prompt/route.ts # GET: weekly cron — sends next question
components/
  EntryForm.tsx               # Story textarea with three states
  HistoryFeed.tsx             # Archive story list + in-progress banner
  PasscodeLock.tsx            # Passcode gate for the archive
db/
  schema.sql                  # Run in Supabase SQL editor to create tables
  seed.sql                    # 15 starter questions
lib/
  supabase.ts                 # Supabase client (service role)
__tests__/
  api/stories/submit.test.ts  # Unit tests for the submit API
```

## Environment variables reference

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `NEXT_PUBLIC_BASE_URL` | Public URL of the deployed app (no trailing slash) |
| `FAMILY_EMAILS` | Comma-separated email addresses for notifications and prompts |
| `FAMILY_PASSCODE` | Passcode to access the family archive |
| `CRON_SECRET` | Secret for authenticating the weekly cron endpoint |
