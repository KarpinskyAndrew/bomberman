<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    /** Waiting for a new key in Settings > Controls. */
    rebinding?: boolean
  }>(),
  { rebinding: false },
)
</script>

<template>
  <kbd
    class="inline-grid h-7 min-w-7 place-items-center whitespace-nowrap rounded-kbd border border-b-[3px] bg-field px-2
      font-ui text-xs font-semibold"
    :class="rebinding ? 'animate-blink border-fire-2 text-fire-1' : 'border-edge-strong text-ink'"
  >{{ label }}</kbd>
</template>
