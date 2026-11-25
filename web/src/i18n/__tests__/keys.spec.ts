import { describe, expect, it } from 'vitest'
import { flattenKeys, sameKeys } from '../keys'

describe('flattenKeys', () => {
  it('returns the keys of a flat object', () => {
    expect(flattenKeys({ a: 'x', b: 'y' })).toEqual(['a', 'b'])
  })

  it('joins nested keys with dots', () => {
    expect(flattenKeys({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual(['a.b', 'a.c.d', 'e'])
  })

  it('returns no keys for an empty object', () => {
    expect(flattenKeys({})).toEqual([])
  })

  it('counts an empty nested object as no keys', () => {
    expect(flattenKeys({ a: {}, b: 'x' })).toEqual(['b'])
  })
})

describe('sameKeys', () => {
  const en = {
    landing: { title: 'Title', play: 'Play', sizes: { small: 'Small', large: 'Large' } },
  }

  it('is false when the second dictionary misses a key', () => {
    const hu = { landing: { title: 'Cím', sizes: { small: 'Kicsi', large: 'Nagy' } } }
    expect(sameKeys(en, hu)).toBe(false)
  })

  it('is false when the first dictionary misses a key', () => {
    const hu = { landing: { title: 'Cím', sizes: { small: 'Kicsi', large: 'Nagy' } } }
    expect(sameKeys(hu, en)).toBe(false)
  })

  it('is false when a nested key is missing', () => {
    const hu = { landing: { title: 'Cím', play: 'Játék', sizes: { small: 'Kicsi' } } }
    expect(sameKeys(en, hu)).toBe(false)
  })

  it('is false when one key is swapped for another', () => {
    const hu = {
      landing: { title: 'Cím', start: 'Játék', sizes: { small: 'Kicsi', large: 'Nagy' } },
    }
    expect(sameKeys(en, hu)).toBe(false)
  })

  it('is true for the same keys with different values and order', () => {
    const hu = {
      landing: { sizes: { large: 'Nagy', small: 'Kicsi' }, play: 'Játék', title: 'Cím' },
    }
    expect(sameKeys(en, hu)).toBe(true)
  })
})
