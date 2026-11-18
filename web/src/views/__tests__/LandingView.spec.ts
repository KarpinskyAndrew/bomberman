import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LandingView from '../LandingView.vue'

describe('LandingView', () => {
  it('shows the game title', () => {
    const wrapper = mount(LandingView)
    expect(wrapper.get('h1').text()).toBe('BomberMan Online')
  })
})
