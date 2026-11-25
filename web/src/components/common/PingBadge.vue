<script setup lang="ts">
import { computed } from 'vue'
import { pingTone, type PingTone } from './variants'

const props = withDefaults(
  defineProps<{
    ms: number
    region?: string
    /** Hide the region visually (narrow bars); screen readers still get it. */
    compact?: boolean
  }>(),
  { region: undefined, compact: false },
)

const tone = computed(() => pingTone(props.ms))

const DOT: Record<PingTone, string> = {
  ok: 'bg-ok shadow-[0_0_8px_var(--color-ok)]',
  warn: 'bg-warn shadow-[0_0_8px_var(--color-warn)]',
  bad: 'bg-bad shadow-[0_0_8px_var(--color-bad)]',
}
</script>

<template>
  <span
    :data-tone="tone"
    class="inline-flex items-center gap-1.75 whitespace-nowrap text-sm text-muted"
  >
    <span data-dot aria-hidden="true" class="size-2 rounded-full" :class="DOT[tone]" />
    <span
      ><span v-if="region" data-region :class="{ 'sr-only': compact }">{{ `${region} ` }}</span
      ><span class="tabular-nums">{{ Math.round(ms) }} ms</span></span
    >
  </span>
</template>
