<script setup lang="ts">
// TODO(i18n): move the aria-label text to vue-i18n when it is added.
defineProps<{
  filled: number
  max: number
}>()
</script>

<template>
  <span role="img" :aria-label="`${filled} of ${max} players`" class="inline-flex gap-0.75 align-middle">
    <i
      v-for="n in max"
      :key="n"
      data-dot
      class="size-2.25 rounded-full"
      :class="n <= filled ? 'bg-ink' : 'bg-track'"
    />
  </span>
</template>
