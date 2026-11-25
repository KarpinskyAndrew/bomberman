import { describe, expect, it } from 'vitest'
import { buttonClasses, pingTone, playerColorVar } from './variants'

describe('buttonClasses', () => {
  it('always includes the base button shape and focus ring', () => {
    const c = buttonClasses('default', 'md', false)
    expect(c).toContain('inline-flex')
    expect(c).toContain('focus-visible:outline-fire-1')
  })

  it('maps each variant to its token classes', () => {
    expect(buttonClasses('default', 'md', false)).toContain('bg-surface-2')
    expect(buttonClasses('primary', 'md', false)).toContain('text-on-accent')
    expect(buttonClasses('primary', 'md', false)).toContain('bg-(image:--gradient-fire)')
    expect(buttonClasses('danger', 'md', false)).toContain('border-bad/40')
    expect(buttonClasses('ghost', 'md', false)).toContain('bg-transparent')
    expect(buttonClasses('ok', 'md', false)).toContain('border-ok/50')
  })

  it('maps each size to the control size and radius tokens', () => {
    expect(buttonClasses('default', 'sm', false)).toContain('h-(--size-control-sm)')
    expect(buttonClasses('default', 'sm', false)).toContain('rounded-control-sm')
    expect(buttonClasses('default', 'md', false)).toContain('h-(--size-control)')
    expect(buttonClasses('default', 'md', false)).toContain('rounded-control')
    expect(buttonClasses('default', 'lg', false)).toContain('h-(--size-control-lg)')
    expect(buttonClasses('default', 'lg', false)).toContain('rounded-control-lg')
  })

  it('adds full width only for block buttons', () => {
    expect(buttonClasses('default', 'md', true)).toContain('w-full')
    expect(buttonClasses('default', 'md', false)).not.toContain('w-full')
  })
})

describe('pingTone (GUI-PLAN: < 60 / 60-120 / > 120 ms)', () => {
  it.each([
    [0, 'ok'],
    [59, 'ok'],
    [60, 'warn'],
    [120, 'warn'],
    [121, 'bad'],
    [900, 'bad'],
  ] as const)('%i ms is %s', (ms, tone) => {
    expect(pingTone(ms)).toBe(tone)
  })
})

describe('playerColorVar', () => {
  it('maps a 0-based player index to its color token', () => {
    expect(playerColorVar(0)).toBe('var(--color-p1)')
    expect(playerColorVar(3)).toBe('var(--color-p4)')
  })
})
