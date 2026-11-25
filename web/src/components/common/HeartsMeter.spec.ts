import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HeartsMeter from './HeartsMeter.vue'

describe('HeartsMeter', () => {
  it('draws max hearts, hp of them full', () => {
    const w = mount(HeartsMeter, { props: { hp: 3 } })
    expect(w.findAll('svg')).toHaveLength(5)
    expect(w.findAll('[data-heart="full"]')).toHaveLength(3)
    expect(w.findAll('[data-heart="empty"]')).toHaveLength(2)
  })

  it('reads as one image with the count', () => {
    const w = mount(HeartsMeter, { props: { hp: 2, max: 4 } })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('2 of 4 hearts')
  })

  it('clamps hp into 0..max', () => {
    expect(mount(HeartsMeter, { props: { hp: 9 } }).findAll('[data-heart="full"]')).toHaveLength(5)
    expect(mount(HeartsMeter, { props: { hp: -1 } }).findAll('[data-heart="full"]')).toHaveLength(0)
  })

  it('shakes when hit', () => {
    expect(mount(HeartsMeter, { props: { hp: 3, hit: true } }).classes()).toContain('animate-shake')
    expect(mount(HeartsMeter, { props: { hp: 3 } }).classes()).not.toContain('animate-shake')
  })
})
