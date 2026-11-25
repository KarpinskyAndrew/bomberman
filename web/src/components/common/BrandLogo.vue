<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Hide the name below the md breakpoint (narrow top bars). */
    compact?: boolean
  }>(),
  { compact: false },
)
</script>

<template>
  <span
    class="inline-flex items-center gap-2.5 whitespace-nowrap font-display text-lg font-(--font-weight-display)"
  >
    <svg
      viewBox="0 0 32 32"
      width="30"
      height="30"
      aria-hidden="true"
      focusable="false"
      class="flex-none"
    >
      <circle cx="14" cy="19" r="10" fill="#1b2133" stroke="#2c3550" stroke-width="1.5" />
      <circle cx="10.5" cy="15.5" r="3" fill="#fff" opacity=".3" />
      <path
        d="M20 11q3-5 7-4"
        stroke="#c9a46a"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
      />
      <circle cx="27.5" cy="6.5" r="3" fill="#ffb02e" />
    </svg>
    <span data-brand-name :class="{ 'max-md:sr-only': compact }"
      >BomberMan <b class="font-(--font-weight-display) text-fire-2">Online</b></span
    >
  </span>
</template>
