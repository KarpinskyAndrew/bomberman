<script setup lang="ts">
// TODO(i18n): move the aria-label text to vue-i18n when it is added.
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    hp: number
    max?: number
    /** Shake once (hit by a bomb). */
    hit?: boolean
  }>(),
  { max: 5, hit: false },
)

const full = computed(() => Math.min(Math.max(Math.round(props.hp), 0), props.max))
</script>

<template>
  <span
    role="img"
    :aria-label="`${full} of ${max} hearts`"
    class="inline-flex gap-0.5 text-[17px] leading-none"
    :class="{ 'animate-shake': hit }"
  >
    <AppIcon
      v-for="n in max"
      :key="n"
      name="heart"
      :data-heart="n <= full ? 'full' : 'empty'"
      :class="n <= full ? 'text-bad' : 'text-track'"
    />
  </span>
</template>
