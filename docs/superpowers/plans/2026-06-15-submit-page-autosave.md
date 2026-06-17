# Submit Page Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add debounced draft autosave to the weekly write page without changing the existing first-submit email boundary.

**Architecture:** The write page will always load the canonical `stories` row for the current `question_id`. A new draft endpoint will autosave `stories.content` on a `1000ms` debounce without touching `access_tokens.is_used`, while the submit endpoint will upsert the latest story content and use `is_used` only to decide whether to send the family email. The schema gains a one-row-per-question constraint so draft and submit routes can share the same upsert target.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase, Resend

---

## File Map

| File | Change |
|---|---|
| `db/schema.sql` | Add `stories.question_id` uniqueness and `updated_at` column |
| `app/api/stories/draft/route.ts` | Add autosave-only route |
| `app/api/stories/submit/route.ts` | Upsert latest content before notification logic |
| `app/write/[token]/page.tsx` | Always load existing story content, even when `is_used = false` |
| `components/EntryForm.tsx` | Add debounced autosave state machine and status copy |
| `__tests__/api/stories/draft.test.ts` | Add unit tests for draft route |
| `__tests__/api/stories/submit.test.ts` | Update submit tests for upsert-based flow |

## Task 1: Add failing API tests for draft save and submit behavior

**Files:**
- Create: `__tests__/api/stories/draft.test.ts`
- Modify: `__tests__/api/stories/submit.test.ts`

- [ ] **Step 1: Add draft-route tests that describe the required autosave behavior**

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { POST } from '@/app/api/stories/draft/route'

function singleChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'upsert', 'update']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  return chain
}

function resolvingChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'upsert', 'update', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  chain.catch = (reject: (e: unknown) => void) => Promise.resolve(result).catch(reject)
  return chain
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/stories/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const fromMock = supabase.from as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/stories/draft', () => {
  it('upserts story content without flipping is_used', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })
    const draftUpsert = resolvingChain({ error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(draftUpsert)

    const res = await POST(makeRequest({ token: 'draft-token', content: 'Draft story' }))
    expect(res.status).toBe(200)
    expect((draftUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalled()
  })

  it('returns 409 when the weekly story is locked', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 1, error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)

    const res = await POST(makeRequest({ token: 'draft-token', content: 'Draft story' }))
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Update submit-route tests to expect upsert-based persistence on both first and later submits**

```ts
it('upserts latest story content, marks token used, and returns 200 for a fresh token', async () => {
  const tokenLookup = singleChain({
    data: { question_id: 1, is_used: false, expires_at: FUTURE },
    error: null,
  })
  const lockCheck = resolvingChain({ count: 0, error: null })
  const storyUpsert = resolvingChain({ error: null })
  const markUsed = resolvingChain({ error: null })

  fromMock
    .mockReturnValueOnce(tokenLookup)
    .mockReturnValueOnce(lockCheck)
    .mockReturnValueOnce(storyUpsert)
    .mockReturnValueOnce(markUsed)

  const res = await POST(makeRequest())
  expect(res.status).toBe(200)
  expect((storyUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalled()
})

it('upserts latest content and skips email side effects when token is already used', async () => {
  const tokenLookup = singleChain({
    data: { question_id: 1, is_used: true, expires_at: FUTURE },
    error: null,
  })
  const lockCheck = resolvingChain({ count: 0, error: null })
  const storyUpsert = resolvingChain({ error: null })

  fromMock
    .mockReturnValueOnce(tokenLookup)
    .mockReturnValueOnce(lockCheck)
    .mockReturnValueOnce(storyUpsert)

  const res = await POST(makeRequest())
  expect(res.status).toBe(200)
  expect((storyUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalled()
})
```

- [ ] **Step 3: Run the API tests to verify the new expectations fail before implementation**

Run: `npm test -- __tests__/api/stories/draft.test.ts __tests__/api/stories/submit.test.ts`

Expected: FAIL because the draft route does not exist yet and the submit route still uses insert/update semantics.

- [ ] **Step 4: Commit the failing tests**

```bash
git add __tests__/api/stories/draft.test.ts __tests__/api/stories/submit.test.ts
git commit -m "test: cover story draft autosave flow"
```

## Task 2: Implement the shared draft persistence model in the schema and API routes

**Files:**
- Modify: `db/schema.sql`
- Create: `app/api/stories/draft/route.ts`
- Modify: `app/api/stories/submit/route.ts`

- [ ] **Step 1: Update the schema so `stories` can be upserted by `question_id`**

```sql
CREATE TABLE public.stories (
  id integer NOT NULL DEFAULT nextval('stories_id_seq'::regclass),
  question_id integer NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stories_pkey PRIMARY KEY (id),
  CONSTRAINT stories_question_id_key UNIQUE (question_id),
  CONSTRAINT stories_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
```

- [ ] **Step 2: Add the draft-save route with token validation, lock checks, and story upsert**

```ts
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, content } = await request.json()

  const { data: tokenData, error: tokenError } = await supabase
    .from('access_tokens')
    .select('question_id, is_used, expires_at')
    .eq('token', token)
    .single()

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 403 })
  }

  const { count } = await supabase
    .from('access_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', tokenData.question_id)
    .gt('expires_at', tokenData.expires_at)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'This story has been locked.' }, { status: 409 })
  }

  if (!tokenData.is_used && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 })
  }

  const { error: draftError } = await supabase
    .from('stories')
    .upsert(
      [{ question_id: tokenData.question_id, content, updated_at: new Date().toISOString() }],
      { onConflict: 'question_id' }
    )

  if (draftError) {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Update the submit route to upsert story content before email logic**

```ts
const { error: storyError } = await supabase
  .from('stories')
  .upsert(
    [{ question_id: tokenData.question_id, content, updated_at: new Date().toISOString() }],
    { onConflict: 'question_id' }
  )

if (storyError) {
  return NextResponse.json({ error: 'Failed to save story' }, { status: 500 })
}

if (!tokenData.is_used) {
  const { error: markUsedError } = await supabase
    .from('access_tokens')
    .update({ is_used: true })
    .eq('token', token)

  if (markUsedError) {
    console.error('Failed to mark token as used:', markUsedError)
  }

  // send email exactly once
}
```

- [ ] **Step 4: Run the API test files again**

Run: `npm test -- __tests__/api/stories/draft.test.ts __tests__/api/stories/submit.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the schema and route work**

```bash
git add db/schema.sql app/api/stories/draft/route.ts app/api/stories/submit/route.ts
git commit -m "feat: add story draft autosave routes"
```

## Task 3: Implement write-page loading and debounced autosave UI

**Files:**
- Modify: `app/write/[token]/page.tsx`
- Modify: `components/EntryForm.tsx`

- [ ] **Step 1: Update the write page to load an existing story row regardless of `is_used`**

```tsx
let existingStory = ''
const { data: storyData } = await supabase
  .from('stories')
  .select('content')
  .eq('question_id', tokenData.question_id)
  .single()

if (storyData) existingStory = storyData.content
```

- [ ] **Step 2: Add debounced autosave state to `EntryForm`**

```tsx
const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
const lastSavedContentRef = useRef(initialContent)
const inFlightDraftRef = useRef(false)
const pendingDraftRef = useRef<string | null>(null)

async function saveDraft(nextContent: string) {
  if (!nextContent.trim() || nextContent === lastSavedContentRef.current) return

  if (inFlightDraftRef.current) {
    pendingDraftRef.current = nextContent
    return
  }

  inFlightDraftRef.current = true
  setDraftStatus('saving')

  try {
    const res = await fetch('/api/stories/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, content: nextContent }),
    })

    if (!res.ok) throw new Error('draft failed')

    lastSavedContentRef.current = nextContent
    setDraftStatus('saved')
  } catch {
    setDraftStatus('error')
  } finally {
    inFlightDraftRef.current = false
    if (pendingDraftRef.current && pendingDraftRef.current !== lastSavedContentRef.current) {
      const pending = pendingDraftRef.current
      pendingDraftRef.current = null
      void saveDraft(pending)
    }
  }
}
```

- [ ] **Step 3: Wire the autosave cadence and submit flush behavior**

```tsx
useEffect(() => {
  if (isLocked) return

  const timeout = window.setTimeout(() => {
    void saveDraft(content)
  }, 1000)

  return () => window.clearTimeout(timeout)
}, [content, isLocked])

async function handleSubmit() {
  if (!content.trim()) return
  setStatus('submitting')

  try {
    await saveDraft(content)
    const res = await fetch('/api/stories/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, content }),
    })
    if (!res.ok) throw new Error('submit failed')
    setLocalSaved(true)
    setStatus('idle')
  } catch {
    setStatus('error')
  }
}
```

- [ ] **Step 4: Add autosave copy that appears transiently near the textarea**

```tsx
{draftStatus === 'saving' && (
  <p style={{ fontSize: '0.75rem', color: '#7c5c35' }}>Saving draft...</p>
)}
{draftStatus === 'saved' && (
  <p style={{ fontSize: '0.75rem', color: '#7c5c35' }}>Draft saved</p>
)}
{draftStatus === 'error' && (
  <p className="text-red-600 text-sm">Draft save failed. Your latest edits are not stored yet.</p>
)}
```

- [ ] **Step 5: Run targeted lint-style verification via tests and a local browser check**

Run: `npm test -- __tests__/api/stories/draft.test.ts __tests__/api/stories/submit.test.ts`

Manual check:
1. Start `npm run dev`
2. Open a write-link page
3. Type a few characters, pause for about one second, confirm `Saving draft...` then `Draft saved`
4. Refresh the page and confirm the text reloads before first submit
5. Submit once and confirm later edits still autosave

Expected: Autosave status behaves as designed and refresh preserves the draft.

- [ ] **Step 6: Commit the UI changes**

```bash
git add app/write/[token]/page.tsx components/EntryForm.tsx
git commit -m "feat: autosave story drafts on the write page"
```

## Task 4: Run the full unit test suite and finish verification

**Files:**
- No additional file changes required unless verification finds failures

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`

Expected: PASS

- [ ] **Step 2: If tests fail, fix the smallest issue and rerun `npm test` until green**

```bash
npm test
```

Expected: PASS after the final fix.

- [ ] **Step 3: Review git diff to confirm only autosave-related files changed**

Run: `git diff --stat HEAD~3..HEAD`

Expected: Only the schema, routes, write page, form component, and test files changed for this feature.

- [ ] **Step 4: Commit any final verification fixes**

```bash
git add .
git commit -m "test: finalize autosave verification fixes"
```
