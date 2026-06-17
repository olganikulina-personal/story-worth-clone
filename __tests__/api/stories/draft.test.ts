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
import { POST } from '@/app/api/stories/draft/route'
import { mockSend } from 'resend'

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
 * Useful for insert/update/upsert queries that don't end with `.single()`.
 */
function resolvingChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'insert', 'update', 'upsert', 'limit', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['then'] = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  chain['catch'] = (reject: (e: unknown) => void) => Promise.resolve(result).catch(reject)
  return chain
}

function makeRequest(body: Record<string, unknown> = { token: 'test-token', content: 'My draft' }) {
  return new Request('http://localhost/api/stories/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fromTargets() {
  return fromMock.mock.calls.map(([table]) => table)
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 1000).toISOString()

const fromMock = supabase.from as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/stories/draft', () => {
  it('upserts story content without flipping is_used', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })
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
      [expect.objectContaining({ question_id: 1, content: 'My draft', updated_at: expect.any(String) })],
      { onConflict: 'question_id' },
    )
    expect(fromTargets()).toEqual(['access_tokens', 'access_tokens', 'stories'])
    expect((tokenLookup as Record<string, ReturnType<typeof vi.fn>>).update).not.toHaveBeenCalled()
    expect((lockCheck as Record<string, ReturnType<typeof vi.fn>>).update).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('upserts story content when token is already used', async () => {
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
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect((storyUpsert as Record<string, ReturnType<typeof vi.fn>>).upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ question_id: 1, content: 'My draft', updated_at: expect.any(String) })],
      { onConflict: 'question_id' },
    )
    expect(fromTargets()).toEqual(['access_tokens', 'access_tokens', 'stories'])
    expect((tokenLookup as Record<string, ReturnType<typeof vi.fn>>).update).not.toHaveBeenCalled()
    expect((lockCheck as Record<string, ReturnType<typeof vi.fn>>).update).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
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

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'This story has been locked.' })
  })

  it('returns 403 when token is not found', async () => {
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

  it('returns 403 when an unused token is expired', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: PAST },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body).toEqual({ error: 'Invalid or expired link' })
  })

  it('uses expires_at (not created_at) for the lock check on access_tokens', async () => {
    const tokenLookup = singleChain({
      data: { question_id: 1, is_used: false, expires_at: FUTURE },
      error: null,
    })
    const lockCheck = resolvingChain({ count: 0, error: null })
    const storyUpsert = resolvingChain({ error: null })

    fromMock
      .mockReturnValueOnce(tokenLookup)
      .mockReturnValueOnce(lockCheck)
      .mockReturnValueOnce(storyUpsert)

    await POST(makeRequest())

    const gtMock = (lockCheck as Record<string, ReturnType<typeof vi.fn>>)['gt']
    expect(gtMock).toHaveBeenCalled()
    const firstArg: string = gtMock.mock.calls[0][0]
    expect(firstArg).toBe('expires_at')
    expect(firstArg).not.toBe('created_at')
  })
})
