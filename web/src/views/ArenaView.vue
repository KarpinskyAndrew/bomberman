<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AlertBox from '@/components/common/AlertBox.vue'
import GameCanvas from '@/components/game/GameCanvas.vue'
import type { Grid } from '@/game/grid'
import { fetchArena } from '@/net/arenaSocket'

const MAP_SIZES = [15, 17, 21]
const DEFAULT_SIZE = 17

const { t } = useI18n()
const route = useRoute()

const requested = Number(route.query.size) // '21' for /arena/local?size=21
const size = MAP_SIZES.includes(requested) ? requested : DEFAULT_SIZE

// The map arrives later over the WebSocket: null until then.
const grid = ref<Grid | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    grid.value = await fetchArena(size)
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <h1>{{ t('arena.title') }}</h1>
  <GameCanvas v-if="grid" :grid="grid" class="w-[480px] [image-rendering:pixelated]" />
  <AlertBox v-else-if="failed" tone="err">{{ t('arena.unreachable') }}</AlertBox>
  <p v-else>{{ t('arena.loading') }}</p>
</template>
