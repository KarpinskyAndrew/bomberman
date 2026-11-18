import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseChip from './BaseChip.vue'

describe('BaseChip', () => {
  it('renders a muted pill with its slot', () => {
    const w = mount(BaseChip, { slots: { default: '65 % walls' } })
    expect(w.text()).toBe('65 % walls')
    expect(w.classes()).toContain('rounded-pill')
    expect(w.classes()).toContain('text-muted')
  })

  it('turns fire yellow when hot', () => {
    const w = mount(BaseChip, { props: { hot: true } })
    expect(w.classes()).toContain('text-fire-1')
    expect(w.classes()).not.toContain('text-muted')
  })

  it('renders an optional icon', () => {
    expect(mount(BaseChip, { props: { icon: 'alien' } }).find('svg').exists()).toBe(true)
  })
})
