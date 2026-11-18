<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

withDefaults(
  defineProps<{
    icon: IconName
    /** Accessible name and tooltip; an icon-only button must have one. */
    label: string
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' },
)
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    class="inline-grid flex-none cursor-pointer place-items-center rounded-control border border-edge bg-transparent
      text-muted transition-colors duration-(--duration-hover) hover:border-edge-strong hover:text-ink
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fire-1
      disabled:pointer-events-none disabled:opacity-40"
    :class="size === 'sm' ? 'size-(--size-icon-btn-sm)' : 'size-(--size-icon-btn)'"
  >
    <AppIcon :name="icon" :size="size === 'sm' ? 16 : 18" />
  </button>
</template>
