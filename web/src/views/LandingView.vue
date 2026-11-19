<script setup lang="ts">
import { computed, ref } from 'vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import BaseButton from '@/components/common/BaseButton.vue'

const sizeOptions = [
  { value: 15, label: 'Small' },
  { value: 17, label: 'Medium' },
  { value: 21, label: 'Large' },
]
const size = ref(17)

const playTarget = computed(() => ({
  name: 'arena',
  params: { id: 'local' },
  query: { size: size.value },
}))
</script>

<template>
  <h1>BomberMan Online</h1>
  <p>Real-time arena battles with aliens on the loose.</p>

  <SegmentedControl v-model="size" :options="sizeOptions" label="Map size" />
  <BaseButton variant="primary" size="lg" :to="playTarget">Play</BaseButton>
</template>
