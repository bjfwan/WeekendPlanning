<script setup lang="ts">
/** 通用按钮组件 */
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

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

const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()

// 按钮根元素 / 加载指示器 / 文本内容容器引用
const btnRef = ref<HTMLButtonElement | null>(null)
const spinnerRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

// 记录初始 boxShadow，供 hover 离开时恢复
let restBoxShadow = ''

const variantClasses: Record<string, string> = {
  primary: 'bg-coral text-white shadow-lg hover:bg-coral-dark',
  secondary: 'bg-amber text-navy shadow-md hover:bg-amber-light',
  ghost: 'bg-transparent text-navy border-2 border-navy/15 hover:border-coral hover:text-coral'
}

const sizeClasses: Record<string, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg',
  md: 'px-6 py-3 text-base rounded-xl',
  lg: 'px-8 py-4 text-lg rounded-2xl'
}

// 涟漪颜色（按变体适配对比度）
const rippleColor: Record<string, string> = {
  primary: 'rgba(255,255,255,0.55)',
  secondary: 'rgba(255,255,255,0.55)',
  ghost: 'rgba(255,107,107,0.35)'
}

/** 点击涟漪：从点击点扩散圆形，结束后移除元素 */
function handleRipple(e: MouseEvent): void {
  if (prefersReducedMotion() || props.disabled || props.loading) return
  const btn = btnRef.value
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2
  const span = document.createElement('span')
  span.style.cssText =
    `position:absolute;border-radius:9999px;left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
    `background:${rippleColor[props.variant]};pointer-events:none;transform:scale(0);z-index:0;`
  btn.appendChild(span)
  gsap.to(span, {
    scale: 2,
    opacity: 0,
    duration: 0.6,
    ease: 'power2.out',
    onComplete: () => span.remove()
  })
}

/** hover 进入：上浮 + 阴影增强 */
function handleEnter(): void {
  if (prefersReducedMotion() || props.disabled || props.loading) return
  const btn = btnRef.value
  if (!btn) return
  gsap.to(btn, {
    y: -2,
    boxShadow: '0 10px 25px rgba(26,26,46,0.18)',
    duration: 0.25,
    ease: EASE_OUT
  })
}

/** hover 离开：恢复 */
function handleLeave(): void {
  if (props.disabled || props.loading) return
  const btn = btnRef.value
  if (!btn) return
  gsap.to(btn, {
    y: 0,
    boxShadow: restBoxShadow,
    duration: 0.25,
    ease: EASE_OUT
  })
}

/** 按下：轻微下沉（保留按压反馈） */
function handleDown(): void {
  if (prefersReducedMotion() || props.disabled || props.loading) return
  const btn = btnRef.value
  if (!btn) return
  gsap.to(btn, { y: 0, duration: 0.1, ease: EASE_OUT })
}

/** 抬起：回到 hover 上浮态 */
function handleUp(): void {
  if (prefersReducedMotion() || props.disabled || props.loading) return
  const btn = btnRef.value
  if (!btn) return
  gsap.to(btn, { y: -2, duration: 0.2, ease: EASE_OUT })
}

// 用 context 包装：自动在卸载时 revert 同步创建的动画
context(() => {
  // loading 状态过渡：图标弹入 + 文字淡出
  watch(
    () => props.loading,
    (loading) => {
      if (prefersReducedMotion()) return
      if (loading) {
        // 进入加载：spinner 弹入 + 文字淡出
        nextTick(() => {
          if (spinnerRef.value) {
            gsap.from(spinnerRef.value, {
              scale: 0,
              opacity: 0,
              duration: 0.3,
              ease: EASE_BACK
            })
          }
          if (contentRef.value) {
            gsap.to(contentRef.value, { opacity: 0, duration: 0.2, ease: EASE_OUT })
          }
        })
      } else if (contentRef.value) {
        // 退出加载：文字淡入
        gsap.to(contentRef.value, { opacity: 1, duration: 0.3, ease: EASE_OUT })
      }
    }
  )

  onMounted(() => {
    if (btnRef.value) {
      restBoxShadow = getComputedStyle(btnRef.value).boxShadow
    }
  })

  onBeforeUnmount(() => {
    if (btnRef.value) gsap.killTweensOf(btnRef.value)
    if (spinnerRef.value) gsap.killTweensOf(spinnerRef.value)
    if (contentRef.value) gsap.killTweensOf(contentRef.value)
  })
})
</script>

<template>
  <button
    ref="btnRef"
    :type="type"
    :disabled="disabled || loading"
    @click="handleRipple"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
    @mousedown="handleDown"
    @mouseup="handleUp"
    :class="[
      'relative overflow-hidden inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-300 cursor-pointer border-none outline-none',
      'focus-visible:ring-4 focus-visible:ring-coral/30',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size]
    ]"
  >
    <!-- 加载指示器 -->
    <span
      v-if="loading"
      ref="spinnerRef"
      class="relative z-10 inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"
    />
    <span ref="contentRef" class="relative z-10 inline-flex items-center gap-2">
      <slot />
    </span>
  </button>
</template>
