import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LandingView from '../LandingView.vue'

describe('LandingView', () => {
  it('shows the game title', () => {
    const wrapper = mount(LandingView)
    expect(wrapper.get('h1').text()).toBe('BomberMan Online')
  })

  it('offers three map sizes with Medium selected', () => {
    const wrapper = mount(LandingView)
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"]')

    expect(radios.map((r) => r.element.value)).toEqual(['15', '17', '21'])
    expect(wrapper.text()).toContain('Small')
    expect(wrapper.text()).toContain('Medium')
    expect(wrapper.text()).toContain('Large')
    expect(wrapper.get<HTMLInputElement>('input[value="17"]').element.checked).toBe(true)
  })

  it('selects Large when clicked', async () => {
    const wrapper = mount(LandingView)

    await wrapper.get('input[value="21"]').setValue(true)

    expect(wrapper.get<HTMLInputElement>('input[value="21"]').element.checked).toBe(true)
    expect(wrapper.get<HTMLInputElement>('input[value="17"]').element.checked).toBe(false)
  })
})
