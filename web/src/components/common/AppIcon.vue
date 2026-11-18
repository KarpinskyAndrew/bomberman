<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconName } from './icons'

const props = withDefaults(
  defineProps<{
    name: IconName
    /** Pixel size; defaults to the current font size. */
    size?: number
    /** Accessible name. Without it the icon is decorative and hidden from screen readers. */
    label?: string
  }>(),
  { size: undefined, label: undefined },
)

const dim = computed(() => (props.size === undefined ? '1em' : String(props.size)))
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="dim"
    :height="dim"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="inline-block flex-none align-[-0.125em]"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
    v-html="ICONS[name]"
  />
</template>
