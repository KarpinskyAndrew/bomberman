<script setup lang="ts" generic="T extends string | number">
import { useId } from 'vue'

export interface SegmentOption<V> {
  value: V
  label: string
  disabled?: boolean
}

defineProps<{
  options: readonly SegmentOption<T>[]
  /** Accessible name of the group. */
  label: string
}>()

const model = defineModel<T>({ required: true })

/* Native radios sharing one name: arrow keys, Tab and screen readers work without extra code. */
const name = `seg-${useId()}`
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="inline-flex flex-wrap rounded-control border border-edge bg-field p-0.75 modern:rounded-pill"
  >
    <label
      v-for="opt in options"
      :key="opt.value"
      class="relative rounded-[7px] px-3.5 py-1.5 text-sm font-semibold text-muted modern:rounded-pill
        has-checked:bg-surface-3 has-checked:text-ink has-checked:shadow-[inset_0_0_0_1px_var(--color-edge-strong)]
        has-disabled:cursor-not-allowed has-disabled:opacity-35 has-focus-visible:outline-2
        has-focus-visible:outline-offset-2 has-focus-visible:outline-fire-1"
      :class="opt.disabled ? '' : 'cursor-pointer hover:text-ink'"
    >
      <input
        v-model="model"
        type="radio"
        class="pointer-events-none absolute opacity-0"
        :name="name"
        :value="opt.value"
        :disabled="opt.disabled"
      />
      {{ opt.label }}
    </label>
  </div>
</template>
