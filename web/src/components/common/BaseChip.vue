<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

withDefaults(
  defineProps<{
    /** Highlighted (ranked rules, standard values). */
    hot?: boolean
    icon?: IconName
  }>(),
  { hot: false, icon: undefined },
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border bg-ink/3 px-2.75 py-1.25 text-sm
      font-medium"
    :class="hot ? 'border-fire-1/35 text-fire-1' : 'border-edge text-muted'"
  >
    <AppIcon v-if="icon" :name="icon" :size="14" />
    <slot />
  </span>
</template>
