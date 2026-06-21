<script setup lang="ts">
/** 通用卡片容器组件 */
interface Props {
  hover?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  hover: false,
  padding: 'md'
})

const paddingClasses: Record<string, string> = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
}
</script>

<template>
  <div
    :class="[
      'bg-white rounded-2xl shadow-card transition-all duration-300',
      paddingClasses[props.padding],
      hover && 'hover:-translate-y-1.5 hover:shadow-hover cursor-pointer'
    ]"
  >
    <slot />
  </div>
</template>
