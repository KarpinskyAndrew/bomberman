<script setup lang="ts">
import { computed } from 'vue'
import { playerColorVar, type PlayerIndex } from './variants'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    /** The first letter is shown. Ignored when empty. */
    name?: string
    /** 0-based player slot; sets the color through --pc. */
    playerIndex?: PlayerIndex
    size?: AvatarSize
    guest?: boolean
    /** An unfilled slot. */
    empty?: boolean
  }>(),
  { name: '', playerIndex: 0, size: 'sm', guest: false, empty: false },
)

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-(--size-avatar-sm) text-md',
  md: 'size-(--size-avatar-md) text-[26px]',
  lg: 'size-(--size-avatar-lg) text-[32px]',
  xl: 'size-(--size-avatar-xl) text-[36px]',
}

const letter = computed(() => (props.empty ? '' : props.name.trim().charAt(0).toUpperCase()))
const style = computed(() =>
  props.empty || props.guest ? undefined : { '--pc': playerColorVar(props.playerIndex) },
)
const tone = computed(() => {
  if (props.empty) return 'border-2 border-dashed border-edge-strong bg-transparent'
  if (props.guest) return 'bg-track text-muted'
  return 'bg-(--pc) text-on-player'
})
</script>

<template>
  <span
    aria-hidden="true"
    class="grid flex-none select-none place-items-center rounded-avatar font-extrabold"
    :class="[SIZES[size], tone]"
    :style="style"
    >{{ letter }}</span
  >
</template>
