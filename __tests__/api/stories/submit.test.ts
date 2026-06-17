import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mocks must be at top level before any imports that use them
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ id: 'test-email-id' })
  function MockResend() {
    return { emails: { send: mockSend } }
  }
  return { Resend: MockResend, mockSend }
})

import { supabase } from '@/lib/supabase'
import { POST } from '@/app/api/stories/submit/route'
import { mockSend } from 'resend'

// --- Mock chain helpers ---

/**
 * Builds a chainable mock where every method returns `chain` itself,
 * and `.single()` resolves to `result`.
 */
function singleChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'insert', 'update', 'upsert', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['single'] = vi.fn().mockResolvedValue(result)
  return chain
}

/**
 * Builds a chainable mock that resolves directly (not via .single()).
 * Useful for insert/update/count queries that don't end with `.single()`.
 */
function resolvingChain(result: unknown) {
  // Make the chain itself a thenable so `await chain` resolves.
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'insert', 'update', 'upsert', 'limit', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // Make `await chain` work by adding then/catch
  chain['then'] = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  chain['catch'] = (reject: (e: unknown) => void) => Promise.resolve(result).catch(reject)
  return chain
}

// Helper: build a standard POST Request
function makeRequest(body: Record<string, unknown> = { token: 'test-token', content: 'My story' }) {
  return new Request('http://localhost/api/stories/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fromTargets() {
  return fromMock.mock.calls.map(([table]) => table)
}

// Future-dated expires_at (not expired)
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
// Past expires_at (expired)
const PAST = new Date(Date.now() - 1000).toISOString()

const fromMock = supabase.from as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/stories/submit', () => {
  // ---------------------------------------------------------------------------
  // Case 1: fresh (unused) token — happy path
  // ---------------------------------------------------------------------------
  it('upserts story, marks token used, sends email, returns 200 for a fresh token', async () => {
    // Call 1: token lookup → found, unused, not expired
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    // Call 2: lock check → count = 0 (no newer token)
    const lockCheck = resolvingChain({ count: 0, error: null })
    // Call 3: upsert story → success
    const storyUpsert = resolvingChain({ error: null })
    // Call 4: mark token used → success
    const markUsed = resolvingChain({ error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(storyUpsert)
      .mockReturnValueOnce(markUsed)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect((storyUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ question_id: 1, content: 'My story', updated_at: expect.any(String) })],
      { onConflict: 'question_id' },
    )
    expect((markUsed as Record<string, ReturnType<typeof vi.fn>>).update).toHaveBeenCalledWith({
      is_used: true,
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('persists the submit request content even if an autosaved draft had different content', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })
    const storyUpsert = resolvingChain({ error: null })
    const markUsed = resolvingChain({ error: null })
    const submitContent = 'Final submit text after stale autosave'

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(storyUpsert)
      .mockReturnValueOnce(markUsed)

    const res = await POST(makeRequest({ token: 'test-token', content: submitContent }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect((storyUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ question_id: 1, content: submitContent, updated_at: expect.any(String) })],
      { onConflict: 'question_id' },
    )
  })

  // ---------------------------------------------------------------------------
  // Case 2: edit (already-used token) — updates story, no email
  // ---------------------------------------------------------------------------
  it('upserts story content and returns 200 when token is already used', async () => {
    // Call 1: token lookup → found, used
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: true, expires_at: FUTURE },
      error: null,
    })
    // Call 2: lock check → count = 0 (not locked)
    const lockCheck = resolvingChain({ count: 0, error: null })
    // Call 3: upsert story → success
    const storyUpsert = resolvingChain({ error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(storyUpsert)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect((storyUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ question_id: 1, content: 'My story', updated_at: expect.any(String) })],
      { onConflict: 'question_id' },
    )
    expect(fromTargets()).toEqual(['access_tokens', 'access_tokens', 'stories'])
    expect((tokenLookup as Record<string, ReturnType<typeof vi.fn>>).update).not.toHaveBeenCalled()
    expect((lockCheck as Record<string, ReturnType<typeof vi.fn>>).update).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Case 3: locked — newer token exists for the same question_id
  // ---------------------------------------------------------------------------
  it('returns 409 when a newer token exists for the same question_id', async () => {
    // Call 1: token lookup → found, unused
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    // Call 2: lock check → count = 1 (locked)
    const lockCheck = resolvingChain({ count: 1, error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'This story has been locked.' })
  })

  it('returns 409 for stale edits after first submit when a newer token exists', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: true, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 1, error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'This story has been locked.' })
    expect(fromTargets()).toEqual(['access_tokens', 'access_tokens'])
    expect(mockSend).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Case 4: invalid token — not found in DB
  // ---------------------------------------------------------------------------
  it('returns 403 when token is not found', async () => {
    // Call 1: token lookup → not found
    const tokenLookup = singleChain({
      data: null,
      error: { message: 'not found' },
    })

    fromMock.mockReturnValueOnce(tokenLookup)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body).toEqual({ error: 'Invalid link' })
  })

  // ---------------------------------------------------------------------------
  // Case 5: expired unused token
  // ---------------------------------------------------------------------------
  it('returns 403 when an unused token is expired', async () => {
    // Call 1: token lookup → found, unused, EXPIRED
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: PAST },
      error: null,
    })
    // Call 2: lock check → count = 0 (not locked)
    const lockCheck = resolvingChain({ count: 0, error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body).toEqual({ error: 'Invalid or expired link' })
  })

  // ---------------------------------------------------------------------------
  // Schema guard: lock check must use `expires_at`, never `created_at`
  // ---------------------------------------------------------------------------
  it('uses expires_at (not created_at) for the lock check on access_tokens', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })
    const storyInsert = resolvingChain({ error: null })
    const markUsed = resolvingChain({ error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(storyInsert)
      .mockReturnValueOnce(markUsed)

    await POST(makeRequest())

    // The second `from('access_tokens')` call is the lock check.
    // Its chain's `.gt()` must be called with 'expires_at', not 'created_at'.
    const gtMock = (lockCheck as Record<string, ReturnType<typeof vi.fn>>)['gt']
    expect(gtMock).toHaveBeenCalled()
    const firstArg: string = gtMock.mock.calls[0][0]
    expect(firstArg).toBe('expires_at')
    expect(firstArg).not.toBe('created_at')
  })

  it('falls back to legacy insert/update persistence when the deployed stories schema has not been migrated yet', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })
    const storyUpsert = resolvingChain({
      error: {
        code: '42P10',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
      },
    })
    const existingStoryLookup = resolvingChain({ data: [], error: null })
    const storyInsert = resolvingChain({ error: null })
    const markUsed = resolvingChain({ error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(storyUpsert)
      .mockReturnValueOnce(existingStoryLookup)
      .mockReturnValueOnce(storyInsert)
      .mockReturnValueOnce(markUsed)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect((storyInsert as Record<string, ReturnType<typeof vi.fn>>).insert).toHaveBeenCalledWith([
      { question_id: 1, content: 'My story' },
    ])
    expect((markUsed as Record<string, ReturnType<typeof vi.fn>>).update).toHaveBeenCalledWith({
      is_used: true,
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})
