import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedControl from './SegmentedControl.vue'

const sizes = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large', disabled: true },
]

function mountSizes(modelValue = 'small') {
  return mount(SegmentedControl, { props: { options: sizes, modelValue, label: 'Arena size' } })
}

describe('SegmentedControl', () => {
  it('is a labelled radio group with one native radio per option', () => {
    const w = mountSizes()
    expect(w.attributes('role')).toBe('radiogroup')
    expect(w.attributes('aria-label')).toBe('Arena size')
    const radios = w.findAll('input[type="radio"]')
    expect(radios).toHaveLength(3)
    expect(w.text()).toContain('Small')
    expect(w.text()).toContain('Large')
  })

  it('gives all radios one shared name so arrow keys move between them', () => {
    const names = mountSizes()
      .findAll('input')
      .map((i) => i.attributes('name'))
    expect(new Set(names).size).toBe(1)
    expect(names[0]).toBeTruthy()
  })

  it('checks the option matching modelValue', () => {
    const radios = mountSizes('medium').findAll('input')
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(false)
    expect((radios[1]!.element as HTMLInputElement).checked).toBe(true)
  })

  it('emits update:modelValue with the chosen value', async () => {
    const w = mountSizes()
    await w.findAll('input')[1]!.setValue(true)
    expect(w.emitted('update:modelValue')).toEqual([['medium']])
  })

  it('disables single options', () => {
    const radios = mountSizes().findAll('input')
    expect(radios[2]!.attributes('disabled')).toBeDefined()
    expect(radios[0]!.attributes('disabled')).toBeUndefined()
  })

  it('works with numeric values', async () => {
    const w = mount(SegmentedControl, {
      props: {
        options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })),
        modelValue: 2,
        label: 'Max players',
      },
    })
    await w.findAll('input')[2]!.setValue(true)
    expect(w.emitted('update:modelValue')).toEqual([[4]])
  })
})
