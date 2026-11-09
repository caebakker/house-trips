import { describe, expect, it } from 'vitest'
import {
  buyerVerificationStatus,
  compareQueue,
  formatDistance,
  verificationFailure,
} from './status'

describe('buyerVerificationStatus', () => {
  it('shows requested while a check is open', () => {
    expect(
      buyerVerificationStatus('check_requested', [
        { status: 'not_found', createdAt: '2026-01-01T00:00:00Z' },
        { status: 'queued', createdAt: '2026-02-01T00:00:00Z' },
      ]),
    ).toBe('requested')
    expect(
      buyerVerificationStatus('check_requested', [{ status: 'in_review', createdAt: '2026-02-01T00:00:00Z' }]),
    ).toBe('requested')
  })

  it('shows found and not found from the latest closed check', () => {
    expect(buyerVerificationStatus('verified', [])).toBe('found')
    expect(
      buyerVerificationStatus('not_found', [
        { status: 'not_found', createdAt: '2026-03-01T00:00:00Z' },
        { status: 'not_found', createdAt: '2026-01-01T00:00:00Z' },
      ]),
    ).toBe('not_found')
    expect(buyerVerificationStatus('approximate', [])).toBe('none')
  })
})

describe('compareQueue', () => {
  it('sorts by trip date, soonest first', () => {
    const rows = [
      { tripStart: '2026-12-01', createdAt: '2026-01-01T00:00:00Z', name: 'later' },
      { tripStart: '2026-11-02', createdAt: '2026-02-01T00:00:00Z', name: 'soon-new' },
      { tripStart: '2026-11-02', createdAt: '2026-01-15T00:00:00Z', name: 'soon-old' },
    ]
    expect([...rows].sort(compareQueue).map((row) => row.name)).toEqual([
      'soon-old',
      'soon-new',
      'later',
    ])
  })
})

describe('verificationFailure', () => {
  it('recognises a missing credit', () => {
    expect(verificationFailure('no credits')).toBe('no_credits')
    expect(verificationFailure('already requested')).toBe('already')
    expect(verificationFailure('something else')).toBe('save')
  })
})

describe('formatDistance', () => {
  it('uses metres and kilometres', () => {
    expect(formatDistance(800)).toBe('800 metres')
    expect(formatDistance(1200)).toBe('1.2 km')
    expect(formatDistance(10500)).toBe('11 km')
  })
})
