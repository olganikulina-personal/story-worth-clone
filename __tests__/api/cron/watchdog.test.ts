import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ id: 'watchdog-email-id' })
  function MockResend() {
    return { emails: { send: mockSend } }
  }
  return { Resend: MockResend, mockSend }
})

vi.mock('@/lib/audit', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

import { supabase } from '@/lib/supabase'
import { recordAuditEvent } from '@/lib/audit'
import { mockSend } from 'resend'
import { GET } from '@/app/api/cron/watchdog/route'

function resolvingChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'gte', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  chain.catch = (reject: (e: unknown) => void) => Promise.resolve(result).catch(reject)
  return chain
}

function makeRequest() {
  return new Request('http://localhost/api/cron/watchdog', {
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
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('ADMIN_ALERT_EMAIL', 'alerts@example.com')
  vi.stubEnv('FAMILY_EMAILS', 'family@example.com')
})

describe('GET /api/cron/watchdog', () => {
  it('returns healthy without sending email when a recent weekly prompt completion exists', async () => {
    const recentEvents = resolvingChain({
      data: [
        {
          event_type: 'question_marked_sent',
          status: 'success',
          route: '/api/cron/send-prompt',
          message: null,
        },
      ],
      error: null,
    })

    fromMock.mockReturnValueOnce(recentEvents)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, healthy: true })
    expect(mockSend).not.toHaveBeenCalled()
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it('sends an alert email once when no recent weekly prompt completion exists', async () => {
    const recentCronEvents = resolvingChain({
      data: [
        {
          event_type: 'cron_started',
          status: 'success',
          route: '/api/cron/send-prompt',
          message: null,
        },
      ],
      error: null,
    })
    const recentAlerts = resolvingChain({
      data: [],
      error: null,
    })

    fromMock
      .mockReturnValueOnce(recentCronEvents)
      .mockReturnValueOnce(recentAlerts)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, healthy: false, alerted: true })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'watchdog_alert_sent',
        status: 'success',
        route: '/api/cron/watchdog',
      }),
    )
  })

  it('does not send a duplicate alert when a recent watchdog alert already exists', async () => {
    const recentCronEvents = resolvingChain({
      data: [],
      error: null,
    })
    const recentAlerts = resolvingChain({
      data: [
        {
          event_type: 'watchdog_alert_sent',
          status: 'success',
          route: '/api/cron/watchdog',
          message: null,
        },
      ],
      error: null,
    })

    fromMock
      .mockReturnValueOnce(recentCronEvents)
      .mockReturnValueOnce(recentAlerts)

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, healthy: false, alerted: false })
    expect(mockSend).not.toHaveBeenCalled()
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
