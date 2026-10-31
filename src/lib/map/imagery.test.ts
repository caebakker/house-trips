import { describe, expect, it } from 'vitest'
import { resolveMapStyleUrl } from './style'
import {
  DEFAULT_ADMIN_IMAGERY_ATTRIBUTION,
  DEFAULT_ADMIN_IMAGERY_URL,
  resolveAdminImagery,
} from './imagery'

describe('resolveAdminImagery', () => {
  it('defaults to Esri World Imagery and the required credit', () => {
    expect(resolveAdminImagery(undefined, undefined)).toEqual({
      url: DEFAULT_ADMIN_IMAGERY_URL,
      attribution: DEFAULT_ADMIN_IMAGERY_ATTRIBUTION,
    })
    expect(resolveAdminImagery('  ', '  ').url).toContain('World_Imagery')
    expect(DEFAULT_ADMIN_IMAGERY_ATTRIBUTION).toContain('Powered by Esri')
    expect(DEFAULT_ADMIN_IMAGERY_ATTRIBUTION).toContain('Maxar')
  })

  it('accepts a configured tile URL and credit line', () => {
    expect(
      resolveAdminImagery('https://tiles.example.com/{z}/{y}/{x}', 'Example imagery'),
    ).toEqual({
      url: 'https://tiles.example.com/{z}/{y}/{x}',
      attribution: 'Example imagery',
    })
  })
})

describe('buyer map stays a street map', () => {
  it('refuses the admin imagery URL', () => {
    expect(resolveMapStyleUrl(DEFAULT_ADMIN_IMAGERY_URL)).not.toContain('Imagery')
    expect(resolveMapStyleUrl(DEFAULT_ADMIN_IMAGERY_URL)).toContain('openfreemap.org')
  })
})
