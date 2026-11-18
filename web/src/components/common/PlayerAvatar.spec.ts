import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerAvatar from './PlayerAvatar.vue'

describe('PlayerAvatar', () => {
  it('shows the uppercase first letter of the name, decoratively', () => {
    const w = mount(PlayerAvatar, { props: { name: 'andrew', playerIndex: 0 } })
    expect(w.text()).toBe('A')
    expect(w.attributes('aria-hidden')).toBe('true')
  })

  it('sets --pc to the player color', () => {
    const w = mount(PlayerAvatar, { props: { name: 'Kate', playerIndex: 2 } })
    expect((w.element as HTMLElement).style.getPropertyValue('--pc')).toBe('var(--color-p3)')
  })

  it.each([
    ['sm', 'size-(--size-avatar-sm)'],
    ['md', 'size-(--size-avatar-md)'],
    ['lg', 'size-(--size-avatar-lg)'],
    ['xl', 'size-(--size-avatar-xl)'],
  ] as const)('size %s uses %s', (size, cls) => {
    expect(mount(PlayerAvatar, { props: { name: 'A', size } }).classes()).toContain(cls)
  })

  it('greys out guests', () => {
    const w = mount(PlayerAvatar, { props: { name: 'Guest-4821', guest: true, playerIndex: 1 } })
    expect(w.classes()).toContain('bg-track')
    expect((w.element as HTMLElement).style.getPropertyValue('--pc')).toBe('')
  })

  it('renders an empty slot with no letter', () => {
    const w = mount(PlayerAvatar, { props: { empty: true } })
    expect(w.text()).toBe('')
    expect(w.classes()).toContain('border-dashed')
  })
})
