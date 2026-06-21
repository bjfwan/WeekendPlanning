<script setup lang="ts">
/** 通用标签组件，支持选中状态（用于心情/兴趣多选） */
interface Props {
  selected?: boolean
  emoji?: string
}

withDefaults(defineProps<Props>(), {
  selected: false
})

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    @click="$emit('click')"
    :class="[
      'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer border-2 outline-none',
      'focus-visible:ring-4 focus-visible:ring-coral/25',
      selected
        ? 'bg-coral text-white border-coral shadow-md scale-105'
        : 'bg-white text-navy border-navy/10 hover:border-coral/50 hover:bg-coral/5'
    ]"
  >
    <span v-if="emoji" class="text-base leading-none">{{ emoji }}</span>
    <slot />
  </button>
</template>
