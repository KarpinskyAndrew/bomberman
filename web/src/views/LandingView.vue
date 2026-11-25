<script setup lang="ts">
import { computed, ref } from 'vue'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sizeOptions = computed(() => [
  { value: 15, label: t('landing.sizes.small') },
  { value: 17, label: t('landing.sizes.medium') },
  { value: 21, label: t('landing.sizes.large') },
])

const size = ref(17)

const playTarget = computed(() => ({
  name: 'arena',
  params: { id: 'local' },
  query: { size: size.value },
}))
</script>

<template>
  <h1>{{ t('landing.title') }}</h1>
  <p>{{ t('landing.tagline') }}</p>

  <SegmentedControl v-model="size" :options="sizeOptions" :label="t('landing.mapSize')" />
  <BaseButton variant="primary" size="lg" :to="playTarget">{{ t('landing.play') }}</BaseButton>
</template>
