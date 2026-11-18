<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    title?: string
    /** Pad the body (20px). Leave off for edge-to-edge tables. */
    padded?: boolean
  }>(),
  { title: undefined, padded: false },
)

const titleId = `panel-${useId()}`
</script>

<template>
  <section
    :aria-labelledby="title ? titleId : undefined"
    class="rounded-panel border border-edge bg-glass bg-(image:--gradient-glass-hi) shadow-(--shadow-panel) [backdrop-filter:var(--blur-glass)]"
  >
    <header
      v-if="title"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4"
    >
      <h2 :id="titleId" class="text-lg font-bold">{{ title }}</h2>
      <slot name="head-extra" />
    </header>
    <div data-panel-body :class="{ 'p-5': padded }">
      <slot />
    </div>
  </section>
</template>
