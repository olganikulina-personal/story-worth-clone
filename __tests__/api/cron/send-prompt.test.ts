import { vi, describe, it, expect, beforeEach } from 'vitest'

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

vi.mock('@/lib/audit', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

import { supabase } from '@/lib/supabase'
import { GET } from '@/app/api/cron/send-prompt/route'
import { recordAuditEvent } from '@/lib/audit'
import { mockSend } from 'resend'

function singleChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'insert', 'update', 'upsert', 'limit', 'order']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  return chain
}

function resolvingChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gt', 'insert', 'update', 'upsert', 'limit', 'order', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  chain.catch = (reject: (e: unknown) => void) => Promise.resolve(result).catch(reject)
  return chain
}

function makeRequest() {
  return new Request('http://localhost/api/cron/send-prompt', {
    method: 'GET',
    headers: {
      authorization: 'Bearer test-cron-secret',
    },
  })
}

const fromMock = supabase.from as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com')
  vi.stubEnv('FAMILY_EMAILS', 'alerts@example.com')
  vi.stubEnv('RESEND_API_KEY', 're_test')
})

describe('GET /api/cron/send-prompt', () => {
  it('records audit success events for the cron workflow', async () => {
    const questionLookup = singleChain({
      data: { id: 7, prompt: 'Tell me about your childhood home' },
      error: null,
    })
    const tokenInsert = singleChain({
      data: { token: 'uuid-1' },
      error: null,
    })
    const questionUpdate = resolvingChain({ error: null })
    fromMock
      .mockReturnValueOnce(questionLookup)
      .mockReturnValueOnce(tokenInsert)
      .mockReturnValueOnce(questionUpdate)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'cron_started',
        status: 'success',
        route: '/api/cron/send-prompt',
      })
    )
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'prompt_email_sent',
        status: 'success',
        question_id: 7,
        token: 'uuid-1',
      })
    )
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'question_marked_sent',
        status: 'success',
        question_id: 7,
      })
    )
  })

  it('records an audit error when marking the question as sent fails', async () => {
    const questionLookup = singleChain({
      data: { id: 7, prompt: 'Tell me about your childhood home' },
      error: null,
    })
    const tokenInsert = singleChain({
      data: { token: 'uuid-1' },
      error: null,
    })
    const questionUpdate = resolvingChain({ error: { message: 'update failed' } })
    fromMock
      .mockReturnValueOnce(questionLookup)
      .mockReturnValueOnce(tokenInsert)
      .mockReturnValueOnce(questionUpdate)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'Failed' })
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'question_marked_sent',
        status: 'error',
        question_id: 7,
        message: 'update failed',
      })
    )
  })
})
