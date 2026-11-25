import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandLogo from './BrandLogo.vue'

describe('BrandLogo', () => {
  it('shows the bomb mark and the name', () => {
    const w = mount(BrandLogo)
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
    expect(w.text()).toBe('BomberMan Online')
    expect(w.find('b').text()).toBe('Online')
  })

  it('hides the name visually below md when compact, keeping it for screen readers', () => {
    expect(mount(BrandLogo).find('[data-brand-name]').classes()).not.toContain('max-md:sr-only')
    expect(
      mount(BrandLogo, { props: { compact: true } })
        .find('[data-brand-name]')
        .classes(),
    ).toContain('max-md:sr-only')
  })
})
