<script setup lang="ts">
import GameCanvas from '@/components/game/GameCanvas.vue'
import { DEMO_MAP } from '@/game/demoMap'
import { parseGrid } from '@/game/grid'

const grid = parseGrid(DEMO_MAP)
</script>

<template>
  <h1>Arena</h1>
  <GameCanvas :grid="grid" class="w-[480px] [image-rendering:pixelated]" />
</template>
