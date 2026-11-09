import { describe, expect, it } from 'vitest'
import { moveToDay, regenerate, setLocked } from '../plan/edit'
import { buildPlan, timeRoute, type ScheduleContext, type SchedStop } from './schedule'
import { LANGHE_DAYS, LANGHE_STOPS, langheContext } from './fixture'
import { daylightMinutes, formatClock, openWindows } from './time'

function ctx(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    days: ['2026-11-10'],
    travel: () => 0,
    maxDriveMinutes: 240,
    lunchStart: 12 * 60 + 30,
    lunchEnd: 15 * 60,
    daylight: { '2026-11-10': { sunrise: 8 * 60, sunset: 18 * 60 } },
    ...overrides,
  }
}

function stop(partial: Partial<SchedStop> & { id: string }): SchedStop {
  return {
    dwellMinutes: 10,
    priority: 2,
    lockedDay: null,
    lockedPosition: null,
    ...partial,
  }
}

describe('daylight', () => {
  it('splits the day around lunch', () => {
    expect(openWindows(8 * 60, 18 * 60, 12 * 60 + 30, 15 * 60)).toEqual([
      { start: 8 * 60, end: 12 * 60 + 30 },
      { start: 15 * 60, end: 18 * 60 },
    ])
  })

  it('keeps a visit out of the lunch closure', () => {
    const travel = (from: string, to: string) => {
      if (from === 'a' && to === 'b') return 20
      return 0
    }
    const timed = timeRoute(
      ctx({ travel, maxDriveMinutes: 100 }),
      '2026-11-10',
      ['a', 'b'],
      (id) => (id === 'a' ? 240 : 20),
    )
    expect(timed.ok).toBe(true)
    expect(timed.stops[0]?.arrivalMinute).toBe(8 * 60)
    expect(timed.stops[1]?.arrivalMinute).toBe(15 * 60)
    expect(formatClock(timed.stops[1]?.arrivalMinute ?? 0)).toBe('15:00')
  })

  it('drops a visit that cannot finish before sunset', () => {
    const plan = buildPlan(
      ctx({
        daylight: { '2026-11-10': { sunrise: 10 * 60, sunset: 10 * 60 + 30 } },
        lunchStart: 0,
        lunchEnd: 1,
      }),
      [stop({ id: 'late', dwellMinutes: 40 })],
    )
    expect(plan.days[0]?.stops).toHaveLength(0)
    expect(plan.unscheduled).toEqual([{ id: 'late', reason: 'no_daylight' }])
  })

  it('uses sunrise and sunset in Europe/Rome', () => {
    const light = daylightMinutes('2026-11-10', 44.7, 8.03)
    expect(light).not.toBeNull()
    expect(light!.sunrise).toBeGreaterThan(6 * 60)
    expect(light!.sunrise).toBeLessThan(8 * 60)
    expect(light!.sunset).toBeGreaterThan(16 * 60)
    expect(light!.sunset).toBeLessThan(18 * 60)
    expect(formatClock(light!.sunrise)).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('driving limit', () => {
  it('counts the drive back to the start', () => {
    const travel = (from: string, to: string) => (from === to ? 0 : 50)
    const tooFar = buildPlan(ctx({ travel, maxDriveMinutes: 90 }), [stop({ id: 'house' })])
    expect(tooFar.unscheduled).toEqual([{ id: 'house', reason: 'over_drive_limit' }])

    const fits = buildPlan(ctx({ travel, maxDriveMinutes: 100 }), [stop({ id: 'house' })])
    expect(fits.unscheduled).toHaveLength(0)
    expect(fits.days[0]?.driveMinutes).toBe(100)
    expect(fits.days[0]?.returnDriveMinutes).toBe(50)
    expect(fits.days[0]?.stops[0]?.departureMinute).toBeLessThanOrEqual(18 * 60)
  })

  it('keeps a must-see house ahead of a lower priority', () => {
    const travel = (from: string, to: string) => {
      if (from === to) return 0
      if (from === 'start' && to === 'must') return 40
      if (from === 'must' && to === 'start') return 40
      if (from === 'start' && to === 'later') return 40
      if (from === 'later' && to === 'start') return 40
      return 80
    }
    const plan = buildPlan(ctx({ travel, maxDriveMinutes: 100 }), [
      stop({ id: 'later', priority: 3 }),
      stop({ id: 'must', priority: 1 }),
    ])
    expect(plan.days[0]?.stops.map((item) => item.id)).toEqual(['must'])
    expect(plan.unscheduled.map((item) => item.id)).toEqual(['later'])
  })

  it('drops a must-see house that cannot fit and keeps one that can', () => {
    const travel = (from: string, to: string) => {
      if (from === to) return 0
      if (from === 'start' && to === 'far') return 120
      if (from === 'far' && to === 'start') return 120
      if (from === 'start' && to === 'near') return 20
      if (from === 'near' && to === 'start') return 20
      return 80
    }
    const plan = buildPlan(ctx({ travel, maxDriveMinutes: 100 }), [
      stop({ id: 'far', priority: 1 }),
      stop({ id: 'near', priority: 3 }),
    ])
    expect(plan.days[0]?.stops.map((item) => item.id)).toEqual(['near'])
    expect(plan.unscheduled).toEqual([{ id: 'far', reason: 'over_drive_limit' }])
  })
})

describe('locks and a two-day Langhe trip', () => {
  it('leaves a locked stop on its day when the plan is rebuilt', () => {
    const base = ctx({
      days: ['2026-11-10', '2026-11-11'],
      daylight: {
        '2026-11-10': { sunrise: 8 * 60, sunset: 18 * 60 },
        '2026-11-11': { sunrise: 8 * 60, sunset: 18 * 60 },
      },
      travel: (from, to) => (from === to ? 0 : 15),
    })
    const first = buildPlan(base, [
      stop({ id: 'a', priority: 1 }),
      stop({ id: 'b', priority: 1 }),
    ])
    const stored = setLocked(
      {
        source: 'straight_line',
        lunchStartMinute: base.lunchStart,
        lunchEndMinute: base.lunchEnd,
        days: first.days.map((day) => ({
          date: day.date,
          driveMinutes: day.driveMinutes,
          returnDriveMinutes: day.returnDriveMinutes,
          ok: day.ok,
          reason: day.reason,
          stops: day.stops.map((item) => ({
            tripListingId: item.id,
            locked: item.id === 'b',
            driveMinutes: item.driveMinutes,
            arrivalMinute: item.arrivalMinute,
            departureMinute: item.departureMinute,
          })),
        })),
        unscheduled: [],
      },
      'b',
      true,
    )
    const moved = moveToDay(stored, 'b', '2026-11-11', base, [
      { id: 'a', dwellMinutes: 10, priority: 1 },
      { id: 'b', dwellMinutes: 10, priority: 1 },
    ])
    const again = regenerate(setLocked(moved, 'b', true), base, [
      { id: 'a', dwellMinutes: 10, priority: 1 },
      { id: 'b', dwellMinutes: 10, priority: 1 },
    ], 'straight_line')
    const day = again.days.find((item) => item.stops.some((stopItem) => stopItem.tripListingId === 'b'))
    expect(day?.date).toBe('2026-11-11')
    expect(day?.stops.find((item) => item.tripListingId === 'b')?.locked).toBe(true)
  })

  it('plans ten listings across both days inside the limits', () => {
    const context = langheContext()
    const started = performance.now()
    const plan = buildPlan(
      context,
      LANGHE_STOPS.map((item) =>
        stop({
          id: item.id,
          priority: item.priority,
          dwellMinutes: 10,
        }),
      ),
    )
    expect(performance.now() - started).toBeLessThan(1000)
    expect(plan.unscheduled).toEqual([])
    expect(plan.days).toHaveLength(2)
    for (const day of plan.days) {
      expect(day.stops.length).toBeGreaterThanOrEqual(4)
      expect(day.ok).toBe(true)
      expect(day.driveMinutes).toBeLessThanOrEqual(context.maxDriveMinutes)
      expect(day.driveMinutes).toBeGreaterThan(0)
      const light = context.daylight[day.date]
      for (const visit of day.stops) {
        expect(visit.arrivalMinute).toBeGreaterThanOrEqual(light.sunrise)
        expect(visit.departureMinute).toBeLessThanOrEqual(light.sunset)
        const duringLunch = visit.arrivalMinute < 15 * 60 && visit.departureMinute > 12 * 60 + 30
        expect(duringLunch).toBe(false)
      }
      const clusters = day.stops.map((visit) => LANGHE_STOPS.find((item) => item.id === visit.id)?.cluster)
      const west = clusters.filter((cluster) => cluster === 'west').length
      const east = clusters.filter((cluster) => cluster === 'east').length
      expect(Math.max(west, east)).toBe(clusters.length)
    }
    const placed = plan.days.flatMap((day) => day.stops.map((visit) => visit.id))
    expect(new Set(placed).size).toBe(LANGHE_STOPS.length)
    expect(placed).toEqual(expect.arrayContaining(['bra', 'canelli']))
  })

  it('plans 15 stops on a 3-day trip quickly', () => {
    const days = ['2026-11-10', '2026-11-11', '2026-11-12']
    const daylight = Object.fromEntries(days.map((day) => [day, { sunrise: 7 * 60, sunset: 17 * 60 }]))
    const stops = Array.from({ length: 15 }, (_, index) => stop({ id: `s${index}`, priority: index < 5 ? 1 : 2 }))
    const travel = (from: string, to: string) => {
      const rank = (id: string) => (id === 'start' ? 0 : Number(id.slice(1)) + 1)
      return Math.abs(rank(from) - rank(to)) * 8
    }
    const started = performance.now()
    const plan = buildPlan(
      { days, travel, maxDriveMinutes: 300, lunchStart: 750, lunchEnd: 900, daylight },
      stops,
    )
    expect(performance.now() - started).toBeLessThan(1000)
    expect(plan.days.every((day) => day.driveMinutes <= 300)).toBe(true)
    expect(plan.unscheduled.length).toBeLessThan(15)
    expect(LANGHE_DAYS).toHaveLength(2)
  })
})
