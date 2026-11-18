<script setup lang="ts">
import { ref } from 'vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'

const sizeOptions = [
  { value: 15, label: 'Small' },
  { value: 17, label: 'Medium' },
  { value: 21, label: 'Large' },
]
const size = ref(17)
</script>

<template>
  <h1>BomberMan Online</h1>
  <p>Real-time arena battles with aliens on the loose.</p>

  <SegmentedControl v-model="size" :options="sizeOptions" label="Map size" />  
</template>
