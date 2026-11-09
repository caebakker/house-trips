import { describe, expect, it } from 'vitest'
import { messages } from './messages'

const notice =
  'We help you find and visit the location of listings you have chosen. We are not an estate agency and take no part in the sale. For viewings, prices, offers and any next step, always contact the agent named on the listing.'

describe('messages', () => {
  it('keeps the fixed agency notice', () => {
    expect(messages.en.legal.notice).toBe(notice)
    expect(messages.en.legal.notice.toLowerCase()).not.toContain('fine')
  })

  it('uses UK English punctuation in the copy', () => {
    expect(JSON.stringify(messages.en)).not.toMatch(/[—–]/)
  })

  it('explains the opt-out without mentioning a fine', () => {
    const copy = JSON.stringify({
      terms: messages.en.terms,
      optOut: messages.en.optOut,
      unavailable: messages.en.verification.unavailable,
    }).toLowerCase()
    expect(copy).not.toContain('fine')
    expect(messages.en.verification.unavailable).toBe("This property can't be located.")
    expect(messages.en.optOut.confirm).toBe(
      "I confirm I am the owner of this property, or I have the owner's permission to make this request.",
    )
    expect(messages.en.terms.optOutGoodFaith.toLowerCase()).toContain('good faith')
    expect(messages.en.terms.optOutLink.length).toBeGreaterThan(0)
  })
})
