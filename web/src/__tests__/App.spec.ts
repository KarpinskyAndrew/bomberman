import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('shows the landing page at /', async () => {
    router.push('/')
    await router.isReady()
    const wrapper = mount(App, {
      global: { plugins: [router] },
    })
    expect(wrapper.get('h1').text()).toBe('BomberMan Online')
  })
})
