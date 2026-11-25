import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AlertBox from './AlertBox.vue'

describe('AlertBox', () => {
  it('renders its message with an icon', () => {
    const w = mount(AlertBox, { slots: { default: 'Guests play unrated only.' } })
    expect(w.text()).toBe('Guests play unrated only.')
    expect(w.find('svg').exists()).toBe(true)
  })

  it('defaults to the info tone, announced politely', () => {
    const w = mount(AlertBox)
    expect(w.attributes('role')).toBe('status')
    expect(w.classes()).toContain('border-info/25')
  })

  it('announces errors assertively', () => {
    const w = mount(AlertBox, { props: { tone: 'err' } })
    expect(w.attributes('role')).toBe('alert')
    expect(w.classes()).toContain('border-bad/35')
  })

  it('has a warn tone', () => {
    expect(mount(AlertBox, { props: { tone: 'warn' } }).classes()).toContain('border-warn/30')
  })
})
