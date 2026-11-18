import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import KeyCap from './KeyCap.vue'

describe('KeyCap', () => {
  it('renders the key label in a <kbd>', () => {
    const k = mount(KeyCap, { props: { label: 'Space' } }).find('kbd')
    expect(k.exists()).toBe(true)
    expect(k.text()).toBe('Space')
  })

  it('blinks in fire colors while rebinding', () => {
    expect(mount(KeyCap, { props: { label: 'W' } }).classes()).not.toContain('animate-blink')
    const rebinding = mount(KeyCap, { props: { label: 'W', rebinding: true } })
    expect(rebinding.classes()).toContain('animate-blink')
    expect(rebinding.classes()).toContain('border-fire-2')
  })
})
