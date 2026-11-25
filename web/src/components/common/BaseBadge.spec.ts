import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBadge from './BaseBadge.vue'

describe('BaseBadge', () => {
  it('renders its slot as an uppercase label', () => {
    const w = mount(BaseBadge, { props: { tone: 'ranked' }, slots: { default: 'Ranked 1v1' } })
    expect(w.text()).toBe('Ranked 1v1')
    expect(w.classes()).toContain('uppercase')
    expect(w.classes()).toContain('rounded-badge')
  })

  it.each([
    ['ranked', 'text-fire-1'],
    ['unrated', 'text-muted'],
    ['guest', 'text-dim'],
    ['host', 'text-fire-2'],
    ['live', 'text-ok'],
    ['private', 'text-muted'],
  ] as const)('tone %s uses %s', (tone, cls) => {
    expect(mount(BaseBadge, { props: { tone } }).classes()).toContain(cls)
  })

  it('renders an optional icon', () => {
    expect(
      mount(BaseBadge, { props: { tone: 'private' } })
        .find('svg')
        .exists(),
    ).toBe(false)
    expect(
      mount(BaseBadge, { props: { tone: 'private', icon: 'lock' } })
        .find('svg')
        .exists(),
    ).toBe(true)
  })
})
