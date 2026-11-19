import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LandingView from '../LandingView.vue'
import router from '@/router'

function mountLanding() {
  return mount(LandingView, { global: { plugins: [router] } })
}

describe('LandingView', () => {
  it('shows the game title', () => {
    const wrapper = mountLanding()
    expect(wrapper.get('h1').text()).toBe('BomberMan Online')
  })

  it('offers three map sizes with Medium selected', () => {
    const wrapper = mountLanding()
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"]')

    expect(radios.map((r) => r.element.value)).toEqual(['15', '17', '21'])
    expect(wrapper.text()).toContain('Small')
    expect(wrapper.text()).toContain('Medium')
    expect(wrapper.text()).toContain('Large')
    expect(wrapper.get<HTMLInputElement>('input[value="17"]').element.checked).toBe(true)
  })

  it('selects Large when clicked', async () => {
    const wrapper = mountLanding()

    await wrapper.get('input[value="21"]').setValue(true)

    expect(wrapper.get<HTMLInputElement>('input[value="21"]').element.checked).toBe(true)
    expect(wrapper.get<HTMLInputElement>('input[value="17"]').element.checked).toBe(false)
  })

  it('Play links to the local arena with the default size', () => {
    const wrapper = mountLanding()

    const play = wrapper.get('a')
    expect(play.text()).toBe('Play')
    expect(play.attributes('href')).toBe('/arena/local?size=17')
  })

  it('Play carries the chosen size', async () => {
    const wrapper = mountLanding()

    await wrapper.get('input[value="21"]').setValue(true)
    expect(wrapper.get('a').attributes('href')).toBe('/arena/local?size=21')
  })
})
