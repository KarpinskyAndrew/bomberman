import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PingBadge from './PingBadge.vue'

describe('PingBadge', () => {
  it('shows region and round-trip time', () => {
    expect(mount(PingBadge, { props: { ms: 24, region: 'EU' } }).text()).toBe('EU 24 ms')
  })

  it('rounds the time', () => {
    expect(mount(PingBadge, { props: { ms: 23.6 } }).text()).toBe('24 ms')
  })

  it('hides the region visually when compact', () => {
    const region = mount(PingBadge, { props: { ms: 24, region: 'EU', compact: true } }).find(
      '[data-region]',
    )
    expect(region.classes()).toContain('sr-only')
  })

  it.each([
    [24, 'ok'],
    [80, 'warn'],
    [200, 'bad'],
  ] as const)('%i ms colors the dot %s', (ms, tone) => {
    const w = mount(PingBadge, { props: { ms } })
    expect(w.attributes('data-tone')).toBe(tone)
    expect(w.find('[data-dot]').classes()).toContain(`bg-${tone}`)
  })
})
