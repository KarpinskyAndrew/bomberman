import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SlotDots from './SlotDots.vue'

describe('SlotDots', () => {
  it('draws one dot per slot, filled ones in ink', () => {
    const w = mount(SlotDots, { props: { filled: 3, max: 4 } })
    const dots = w.findAll('[data-dot]')
    expect(dots).toHaveLength(4)
    expect(dots.filter((d) => d.classes('bg-ink'))).toHaveLength(3)
    expect(dots.filter((d) => d.classes('bg-track'))).toHaveLength(1)
  })

  it('reads as one image with the count', () => {
    const w = mount(SlotDots, { props: { filled: 1, max: 2 } })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('1 of 2 players')
  })
})
