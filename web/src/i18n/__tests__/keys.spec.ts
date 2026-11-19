import { describe, expect, it } from 'vitest'
import { flattenKeys } from '../keys'

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
