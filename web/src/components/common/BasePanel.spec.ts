import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BasePanel from './BasePanel.vue'

describe('BasePanel', () => {
  it('renders a section with the panel surface tokens', () => {
    const w = mount(BasePanel, { slots: { default: '<p>body</p>' } })
    expect(w.element.tagName).toBe('SECTION')
    expect(w.classes()).toContain('bg-glass')
    expect(w.classes()).toContain('rounded-panel')
    expect(w.find('p').text()).toBe('body')
  })

  it('renders a head with the title and labels the section by it', () => {
    const w = mount(BasePanel, { props: { title: 'Open arenas' }, slots: { 'head-extra': '<button>Filter</button>' } })
    const h2 = w.find('h2')
    expect(h2.text()).toBe('Open arenas')
    expect(w.attributes('aria-labelledby')).toBe(h2.attributes('id'))
    expect(w.find('header button').text()).toBe('Filter')
  })

  it('has no head without a title', () => {
    expect(mount(BasePanel).find('header').exists()).toBe(false)
  })

  it('pads the body only when padded', () => {
    expect(mount(BasePanel, { props: { padded: true } }).find('[data-panel-body]').classes()).toContain('p-5')
    expect(mount(BasePanel).find('[data-panel-body]').classes()).not.toContain('p-5')
  })
})
