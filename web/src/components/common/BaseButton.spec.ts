import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import BaseButton from './BaseButton.vue'

const global = { stubs: { RouterLink: RouterLinkStub } }

describe('BaseButton', () => {
  it('renders a type="button" with its slot content', () => {
    const b = mount(BaseButton, { slots: { default: 'Play' } }).find('button')
    expect(b.exists()).toBe(true)
    expect(b.attributes('type')).toBe('button')
    expect(b.text()).toBe('Play')
  })

  it('applies variant, size and block classes', () => {
    const b = mount(BaseButton, { props: { variant: 'primary', size: 'lg', block: true } }).find(
      'button',
    )
    expect(b.classes()).toContain('text-on-accent')
    expect(b.classes()).toContain('h-(--size-control-lg)')
    expect(b.classes()).toContain('w-full')
  })

  it('emits click, but not when disabled', async () => {
    const on = mount(BaseButton)
    await on.find('button').trigger('click')
    expect(on.emitted('click')).toHaveLength(1)

    const off = mount(BaseButton, { props: { disabled: true } })
    expect(off.find('button').attributes('disabled')).toBeDefined()
    await off.find('button').trigger('click')
    expect(off.emitted('click')).toBeUndefined()
  })

  it('renders a leading icon', () => {
    const w = mount(BaseButton, { props: { icon: 'play' }, slots: { default: 'Play' } })
    expect(w.find('svg').exists()).toBe(true)
  })

  it('renders an <a> when given href', () => {
    const a = mount(BaseButton, { props: { href: '/privacy' } }).find('a')
    expect(a.exists()).toBe(true)
    expect(a.attributes('href')).toBe('/privacy')
  })

  it('marks a disabled link with aria-disabled and takes it out of the tab order', async () => {
    const w = mount(BaseButton, { props: { href: '/x', disabled: true } })
    const a = w.find('a')
    expect(a.attributes('aria-disabled')).toBe('true')
    expect(a.attributes('tabindex')).toBe('-1')
    await a.trigger('click')
    expect(w.emitted('click')).toBeUndefined()
  })

  it('renders a RouterLink when given to', () => {
    const w = mount(BaseButton, { props: { to: '/lobby' }, global })
    expect(w.findComponent(RouterLinkStub).props('to')).toBe('/lobby')
  })
})
