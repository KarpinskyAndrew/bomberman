import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import router from '@/router'

import ArenaView from '../ArenaView.vue'
import { FakePen } from '@/game/renderer/__tests__/fakePen'
import { TILE } from '@/game/renderer/tiles'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new FakePen() as unknown as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ArenaView', () => {
  it('shows the 17x17 demo map when the url has no size', async () => {
    await router.push('/arena/local')
    const wrapper = mount(ArenaView, { global: { plugins: [router] } })

    expect(wrapper.get('canvas').element.width).toBe(17 * TILE)
  })

  it.each([15, 17, 21])('shows a %i square map depending on grid size', async (size) => {
    const url = '/arena/local?size=' + size
    await router.push(url)
    const wrapper = mount(ArenaView, { global: { plugins: [router] } })

    expect(wrapper.get('canvas').element.width).toBe(size * TILE)
  })

  it.each(['asd', '0', '-85', '16', '99'])(
    'shows the default (17x17) size if the url contains %s',
    async (size) => {
      const url = '/arena/local?size=' + size
      await router.push(url)
      const wrapper = mount(ArenaView, { global: { plugins: [router] } })

      expect(wrapper.get('canvas').element.width).toBe(17 * TILE)
    },
  )
})
