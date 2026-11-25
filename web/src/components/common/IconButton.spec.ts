import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IconButton from './IconButton.vue'

describe('IconButton', () => {
  it('is a button named by its label, with a decorative icon', () => {
    const b = mount(IconButton, { props: { icon: 'gear', label: 'Settings' } }).find('button')
    expect(b.attributes('type')).toBe('button')
    expect(b.attributes('aria-label')).toBe('Settings')
    expect(b.attributes('title')).toBe('Settings')
    expect(b.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('uses the icon-button size tokens', () => {
    expect(mount(IconButton, { props: { icon: 'x', label: 'Close' } }).classes()).toContain(
      'size-(--size-icon-btn)',
    )
    expect(
      mount(IconButton, { props: { icon: 'x', label: 'Close', size: 'sm' } }).classes(),
    ).toContain('size-(--size-icon-btn-sm)')
  })

  it('emits click', async () => {
    const w = mount(IconButton, { props: { icon: 'copy', label: 'Copy code' } })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })
})
