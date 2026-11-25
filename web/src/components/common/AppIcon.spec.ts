import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from './AppIcon.vue'

describe('AppIcon', () => {
  it('renders the named icon as a 24x24 stroke svg', () => {
    const svg = mount(AppIcon, { props: { name: 'bomb' } }).find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.html()).toContain('cx="10.5"')
  })

  it('renders a different shape for a different name', () => {
    const html = mount(AppIcon, { props: { name: 'heart' } }).html()
    expect(html).toContain('M12 20.5')
    expect(html).not.toContain('cx="10.5"')
  })

  it('is hidden from screen readers when decorative', () => {
    const svg = mount(AppIcon, { props: { name: 'gear' } }).find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('role')).toBeUndefined()
  })

  it('is announced when it has a label', () => {
    const svg = mount(AppIcon, { props: { name: 'gear', label: 'Settings' } }).find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Settings')
    expect(svg.attributes('aria-hidden')).toBeUndefined()
  })

  it('sizes to the text by default and accepts an explicit size', () => {
    expect(
      mount(AppIcon, { props: { name: 'x' } })
        .find('svg')
        .attributes('width'),
    ).toBe('1em')
    expect(
      mount(AppIcon, { props: { name: 'x', size: 18 } })
        .find('svg')
        .attributes('width'),
    ).toBe('18')
  })
})
