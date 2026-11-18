import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseModal from './BaseModal.vue'

let wrapper: VueWrapper | undefined

function open(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  wrapper = mount(BaseModal, {
    props: { open: true, title: 'Join by code', ...props },
    slots: { default: '<input id="first" /><button id="last">Join</button>', ...slots },
    attachTo: document.body,
  })
  return wrapper
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('BaseModal', () => {
  it('renders nothing while closed', () => {
    open({ open: false })
    expect(dialog()).toBeNull()
  })

  it('teleports a labelled modal dialog to <body>', () => {
    open()
    const d = dialog()!
    expect(d).not.toBeNull()
    expect(d.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(d.getAttribute('aria-labelledby')!)!
    expect(title.textContent).toBe('Join by code')
  })

  it('renders the footer slot', () => {
    open({}, { footer: '<button id="ok">OK</button>' })
    expect(document.querySelector('footer #ok')).not.toBeNull()
  })

  it('closes on Escape', async () => {
    const w = open()
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('closes on a backdrop click but not on a click inside the card', async () => {
    const w = open()
    dialog()!.querySelector<HTMLElement>('#first')!.click()
    expect(w.emitted('update:open')).toBeUndefined()
    document.querySelector<HTMLElement>('[data-modal-backdrop]')!.click()
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('closes from the close button', async () => {
    const w = open()
    document.querySelector<HTMLElement>('button[aria-label="Close"]')!.click()
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('cannot be dismissed when not closable', async () => {
    const w = open({ closable: false })
    expect(document.querySelector('button[aria-label="Close"]')).toBeNull()
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.querySelector<HTMLElement>('[data-modal-backdrop]')!.click()
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('moves focus into the dialog when it opens', async () => {
    open()
    await nextTick()
    expect(dialog()!.contains(document.activeElement)).toBe(true)
  })

  it('keeps Tab focus inside the dialog', async () => {
    open({ closable: false })
    await nextTick()
    const last = document.getElementById('last')!
    last.focus()
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement?.id).toBe('first')

    const first = document.getElementById('first')!
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    )
    expect(document.activeElement?.id).toBe('last')
  })

  it('returns focus to the opener when it closes', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const w = open()
    await nextTick()
    await w.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
  })

  it('uses the size tokens', () => {
    open({ size: 'wide' })
    expect(dialog()!.className).toContain('--size-modal-wide')
  })
})
