# Daily Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily watchdog cron that inspects recent audit events and emails an admin when the weekly prompt flow has not completed successfully.

**Architecture:** Create a dedicated cron route that reads `audit_events` for the weekly prompt route over a rolling eight-day window. Treat either a successful `question_marked_sent` event or a successful `question_lookup` event with the “no unsent questions remaining” message as healthy; otherwise send a deduplicated alert email and record that alert in `audit_events`.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest, Supabase, Resend, Vercel Cron Jobs

---

### Task 1: Pin watchdog behavior with tests

**Files:**
- Create: `__tests__/api/cron/watchdog.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('returns healthy without sending email when a recent weekly prompt completion exists', async () => {})
it('sends an alert email once when no recent weekly prompt completion exists', async () => {})
it('does not send a duplicate alert when a recent watchdog alert already exists', async () => {})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/api/cron/watchdog.test.ts`
Expected: FAIL because the watchdog route does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function GET(request: Request) {
  // auth, query audit_events, send email if unhealthy
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/api/cron/watchdog.test.ts`
Expected: PASS

### Task 2: Wire the production schedule and docs

**Files:**
- Modify: `vercel.json`
- Modify: `README.md`

- [ ] **Step 1: Add the daily cron schedule**

```json
{
  "path": "/api/cron/watchdog",
  "schedule": "0 12 * * *"
}
```

- [ ] **Step 2: Document the recipient and local testing**

```md
ADMIN_ALERT_EMAIL="you@example.com"
curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/watchdog
```
