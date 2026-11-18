<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

export type BadgeTone = 'ranked' | 'unrated' | 'guest' | 'host' | 'live' | 'private'

withDefaults(
  defineProps<{
    tone: BadgeTone
    icon?: IconName
  }>(),
  { icon: undefined },
)

const TONES: Record<BadgeTone, string> = {
  ranked: 'text-fire-1 border-current bg-fire-1/8',
  unrated: 'text-muted border-edge-strong bg-ink/3',
  guest: 'text-dim border-edge-strong',
  host: 'text-fire-2 border-current bg-fire-2/10',
  live: 'text-ok border-current bg-ok/8',
  private: 'text-muted border-edge-strong',
}
</script>

<template>
  <span
    class="inline-flex h-5.5 items-center gap-1.25 whitespace-nowrap rounded-badge border px-2 text-2xs font-bold
      uppercase tracking-label"
    :class="TONES[tone]"
  >
    <AppIcon v-if="icon" :name="icon" :size="12" />
    <slot />
  </span>
</template>
