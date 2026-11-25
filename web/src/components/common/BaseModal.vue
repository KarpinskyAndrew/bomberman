<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import IconButton from './IconButton.vue'

export type ModalSize = 'sm' | 'md' | 'wide'

const props = withDefaults(
  defineProps<{
    title: string
    size?: ModalSize
    /** Show the close button and allow Escape / backdrop click to dismiss. */
    closable?: boolean
  }>(),
  { size: 'md', closable: true },
)

const open = defineModel<boolean>('open', { required: true })

const titleId = `modal-${useId()}`
const card = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null

const SIZES: Record<ModalSize, string> = {
  sm: 'w-[min(var(--size-modal-sm),100%)]',
  md: 'w-[min(var(--size-modal),100%)]',
  wide: 'w-[min(var(--size-modal-wide),100%)]',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  return card.value ? Array.from(card.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
}

function activate() {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  // Prefer the first field or action in the body over the close button in the head.
  const items = focusables()
  const target = items.find((el) => !el.closest('[data-modal-head]')) ?? items[0] ?? card.value
  target?.focus()
}

function restore() {
  opener?.focus()
  opener = null
}

function close() {
  if (props.closable) open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    event.preventDefault()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  open,
  (now, before) => {
    if (now && !before) activate()
    else if (!now && before) restore()
  },
  { flush: 'post' },
)

onMounted(() => {
  if (open.value) activate()
})

onBeforeUnmount(() => {
  if (open.value) restore()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      data-modal-backdrop
      class="fixed inset-0 z-(--z-modal) grid animate-fade-in place-items-center bg-scrim p-4 [backdrop-filter:var(--blur-scrim)]"
      @click.self="close"
    >
      <div
        ref="card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="max-h-[calc(100vh-32px)] animate-pop-in overflow-auto rounded-modal border border-edge-strong bg-surface shadow-(--shadow-modal) modern:bg-glass-strong modern:[backdrop-filter:var(--blur-glass)]"
        :class="SIZES[size]"
        @keydown="onKeydown"
      >
        <header
          data-modal-head
          class="flex items-center justify-between gap-3 border-b border-edge px-5 py-4.5"
        >
          <h2
            :id="titleId"
            class="font-display text-xl font-(--font-weight-display) tracking-display"
          >
            {{ title }}
          </h2>
          <IconButton v-if="closable" icon="x" label="Close" size="sm" @click="close" />
        </header>
        <div class="grid gap-4.5 p-5">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="flex flex-wrap items-center justify-end gap-2.5 border-t border-edge px-5 py-4"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
