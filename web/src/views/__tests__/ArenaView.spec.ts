import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ArenaView from '../ArenaView.vue'
import { FakePen } from '@/game/renderer/__tests__/fakePen'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ArenaView', () => {
  it('shows the 15x15 demo map on a canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      new FakePen() as unknown as CanvasRenderingContext2D,
    )

    const wrapper = mount(ArenaView)

    expect(wrapper.get('canvas').element.width).toBe(15 * 16)
  })
})
