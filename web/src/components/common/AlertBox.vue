<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

export type AlertTone = 'info' | 'warn' | 'err'

withDefaults(defineProps<{ tone?: AlertTone }>(), { tone: 'info' })

const TONES: Record<AlertTone, { classes: string; icon: IconName }> = {
  info: { classes: 'bg-info/8 border-info/25 text-[#cfe3ff]', icon: 'info' },
  warn: { classes: 'bg-warn/7 border-warn/30 text-[#fff1bf]', icon: 'warn' },
  err: { classes: 'bg-bad/8 border-bad/35 text-[#ffd3d7]', icon: 'warn' },
}
</script>

<template>
  <div
    :role="tone === 'err' ? 'alert' : 'status'"
    class="flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-sm"
    :class="TONES[tone].classes"
  >
    <AppIcon :name="TONES[tone].icon" :size="16" class="mt-0.5" />
    <div class="min-w-0"><slot /></div>
  </div>
</template>
