<script setup lang="ts">
import type { Grid } from '@/game/grid'
import { onMounted, useTemplateRef } from 'vue'

import { GameClient } from '@/game/GameClient'

const props = defineProps<{ grid: Grid }>()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

let client: GameClient | null = null

onMounted(() => {
  if (canvas.value === null) {
    throw new Error('canvas not mounted')
  }
  client = new GameClient(canvas.value, props.grid)
  client.draw()
})
</script>

<template>
  <canvas ref="canvas" />
</template>
