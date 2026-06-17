# Audit Log Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable Supabase-backed audit logging for cron and story write flows so failures and partial successes can be detected later.

**Architecture:** Add one small `audit_events` table in Supabase and a shared server-side helper that writes best-effort audit rows. Instrument the cron, draft, and submit routes at the critical mutation boundaries so later alerting or watchdog checks can reason about real state instead of only transient runtime logs.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest, Supabase, Resend

---

### Task 1: Pin the cron audit behavior with tests

**Files:**
- Create: `__tests__/api/cron/send-prompt.test.ts`
- Test: `__tests__/api/cron/send-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('records audit success events for the cron workflow', async () => {
  // asserts cron_started, prompt_email_sent, question_marked_sent
})

it('records an audit error when marking the question as sent fails', async () => {
  // asserts question_marked_sent status=error
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/api/cron/send-prompt.test.ts`
Expected: FAIL because the cron route does not write audit rows yet.

- [ ] **Step 3: Write minimal implementation**

```ts
await recordAuditEvent({ eventType: 'cron_started', status: 'success', ... })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/api/cron/send-prompt.test.ts`
Expected: PASS

### Task 2: Add the shared audit helper and schema

**Files:**
- Create: `lib/audit.ts`
- Modify: `db/schema.sql`

- [ ] **Step 1: Add the audit table definition**

```sql
CREATE TABLE public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL,
  route text NOT NULL,
  job_key text,
  question_id integer REFERENCES public.questions(id),
  token uuid,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Add a best-effort logger helper**

```ts
export async function recordAuditEvent(input: AuditEventInput) {
  const { error } = await supabase.from('audit_events').insert([payload]);
  if (error) console.error('[audit] failed to record audit event', error);
}
```

### Task 3: Instrument submit and draft mutations

**Files:**
- Modify: `app/api/stories/submit/route.ts`
- Modify: `app/api/stories/draft/route.ts`
- Modify: `__tests__/api/stories/submit.test.ts`
- Modify: `__tests__/api/stories/draft.test.ts`

- [ ] **Step 1: Write failing route assertions**

```ts
expect(auditInsert).toHaveBeenCalledWith([
  expect.objectContaining({ event_type: 'story_saved', status: 'success' }),
])
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `npm test -- __tests__/api/stories/submit.test.ts __tests__/api/stories/draft.test.ts`
Expected: FAIL because the routes do not call the audit helper yet.

- [ ] **Step 3: Add minimal route instrumentation**

```ts
await recordAuditEvent({ eventType: 'story_saved', status: 'success', ... })
```

- [ ] **Step 4: Re-run the route tests**

Run: `npm test -- __tests__/api/stories/submit.test.ts __tests__/api/stories/draft.test.ts`
Expected: PASS
