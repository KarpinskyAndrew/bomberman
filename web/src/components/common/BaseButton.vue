<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './variants'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    block?: boolean
    disabled?: boolean
    /** Leading icon. */
    icon?: IconName
    /** In-app navigation: renders a RouterLink. */
    to?: RouteLocationRaw
    /** Plain link: renders an <a>. */
    href?: string
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'default',
    size: 'md',
    block: false,
    disabled: false,
    icon: undefined,
    to: undefined,
    href: undefined,
    type: 'button',
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const classes = computed(() => buttonClasses(props.variant, props.size, props.block))
const iconSize = computed(() => (props.size === 'sm' ? 14 : props.size === 'lg' ? 20 : 16))
const isLink = computed(() => props.to !== undefined || props.href !== undefined)

function onClick(event: MouseEvent) {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component
    :is="to !== undefined ? RouterLink : 'a'"
    v-if="isLink"
    :to="to"
    :href="to === undefined ? href : undefined"
    :class="classes"
    :aria-disabled="disabled ? 'true' : undefined"
    :tabindex="disabled ? -1 : undefined"
    @click="onClick"
  >
    <AppIcon v-if="icon" :name="icon" :size="iconSize" />
    <slot />
  </component>
  <button v-else :type="type" :class="classes" :disabled="disabled" @click="onClick">
    <AppIcon v-if="icon" :name="icon" :size="iconSize" />
    <slot />
  </button>
</template>
