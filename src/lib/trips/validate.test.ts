import { describe, expect, it } from 'vitest'
import { addDays, formatHours } from '../dates'
import { hoursToDriveMinutes, parseDwellMinutes, tripSpanError, validTripName } from './validate'

describe('trip validation', () => {
  it('adds calendar days without drifting the date', () => {
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('formats driving time in hours', () => {
    expect(formatHours(240)).toBe('4')
    expect(formatHours(90)).toBe('1.5')
    expect(formatHours(60)).toBe('1')
  })

  it('checks the name, dates and driving limits', () => {
    expect(validTripName('  Piemonte  ')).toBe(true)
    expect(validTripName('   ')).toBe(false)
    expect(validTripName('a'.repeat(121))).toBe(false)

    expect(tripSpanError('2026-05-01', '2026-05-01')).toBeNull()
    expect(tripSpanError('2026-05-02', '2026-05-01')).toBe('order')
    expect(tripSpanError('2026-01-01', '2026-03-02')).toBeNull()
    expect(tripSpanError('2026-01-01', '2026-03-03')).toBe('span')

    expect(hoursToDriveMinutes('4')).toBe(240)
    expect(hoursToDriveMinutes('0.5')).toBe(30)
    expect(hoursToDriveMinutes('12')).toBe(720)
    expect(hoursToDriveMinutes('4,5')).toBe(270)
    expect(hoursToDriveMinutes('0.4')).toBeNull()
    expect(hoursToDriveMinutes('13')).toBeNull()

    expect(parseDwellMinutes('10')).toBe(10)
    expect(parseDwellMinutes('0')).toBeNull()
    expect(parseDwellMinutes('10.5')).toBeNull()
    expect(parseDwellMinutes('241')).toBeNull()
  })
})
