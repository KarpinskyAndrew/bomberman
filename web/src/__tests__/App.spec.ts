import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import App from '../App.vue'
import router from '../router'
import { FakePen } from '@/game/renderer/__tests__/fakePen'
import type { fetchArena } from '@/net/arenaSocket'

// The arena page asks the game server for a map; no server runs in tests.
vi.mock('@/net/arenaSocket', () => ({
  fetchArena: vi.fn<typeof fetchArena>(() => new Promise(() => {})),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('shows the landing page at /', async () => {
    await router.push('/')
    const wrapper = mount(App, {
      global: { plugins: [router] },
    })
    expect(wrapper.get('h1').text()).toBe('BomberMan Online')
  })

  it('shows the arena page at /arena/local', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      new FakePen() as unknown as CanvasRenderingContext2D,
    )
    await router.push('/arena/local')
    const wrapper = mount(App, { global: { plugins: [router] } })

    expect(wrapper.get('h1').text()).toBe('Arena')
  })
})
