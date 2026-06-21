<script setup lang="ts">
/** 通用按钮组件 */
interface Props {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false
})

const variantClasses: Record<string, string> = {
  primary:
    'bg-coral text-white shadow-lg hover:bg-coral-dark hover:-translate-y-0.5 active:translate-y-0',
  secondary:
    'bg-amber text-navy shadow-md hover:bg-amber-light hover:-translate-y-0.5 active:translate-y-0',
  ghost:
    'bg-transparent text-navy border-2 border-navy/15 hover:border-coral hover:text-coral'
}

const sizeClasses: Record<string, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg',
  md: 'px-6 py-3 text-base rounded-xl',
  lg: 'px-8 py-4 text-lg rounded-2xl'
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-300 cursor-pointer border-none outline-none',
      'focus-visible:ring-4 focus-visible:ring-coral/30',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
      variantClasses[variant],
      sizeClasses[size]
    ]"
  >
    <!-- 加载指示器 -->
    <span
      v-if="loading"
      class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
    />
    <slot />
  </button>
</template>
