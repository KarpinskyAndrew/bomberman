import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DividerLabel from './DividerLabel.vue'

describe('DividerLabel', () => {
  it('renders its text between two decorative rules', () => {
    const w = mount(DividerLabel, { slots: { default: 'Custom rules' } })
    expect(w.text()).toBe('Custom rules')
    expect(w.classes()).toContain('uppercase')
    expect(w.findAll('[aria-hidden="true"]')).toHaveLength(2)
  })
})
