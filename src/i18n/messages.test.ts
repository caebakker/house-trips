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
})
