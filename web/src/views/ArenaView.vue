<script setup lang="ts">
import GameCanvas from '@/components/game/GameCanvas.vue'
import { DEMO_MAP_15, DEMO_MAP_17, DEMO_MAP_21 } from '@/game/demoMap'
import { parseGrid } from '@/game/grid'
import { useRoute } from 'vue-router'

const MAPS: Record<number, string> = {
  15: DEMO_MAP_15,
  17: DEMO_MAP_17,
  21: DEMO_MAP_21,
}

const route = useRoute()
const size = Number(route.query.size) // '21' for /arena/local?size=21

const mapText = MAPS[size] ?? DEMO_MAP_17
const grid = parseGrid(mapText)
</script>

<template>
  <h1>Arena</h1>
  <GameCanvas :grid="grid" class="w-[480px] [image-rendering:pixelated]" />
</template>
