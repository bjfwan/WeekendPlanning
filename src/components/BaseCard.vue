<script setup lang="ts">
/** 通用卡片容器组件 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  hover?: boolean
  padding?: 'sm' | 'md' | 'lg'
  /** 是否在挂载时播放入场动画 */
  appear?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  hover: false,
  padding: 'md',
  appear: false
})

const { gsap, matchMedia, context, EASE_OUT } = useGsap()

const cardRef = ref<HTMLElement | null>(null)

const paddingClasses: Record<string, string> = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
}

// 阴影值（与 tailwind shadow-card / shadow-hover 一致）
const REST_SHADOW = '0 4px 24px rgba(26,26,46,0.08)'
const HOVER_SHADOW = '0 12px 40px rgba(26,26,46,0.14)'

/** hover 进入：上浮 + 缩放 + 阴影增强 */
function handleEnter(): void {
  if (prefersReducedMotion() || !props.hover || !cardRef.value) return
  gsap.to(cardRef.value, {
    y: -6,
    scale: 1.01,
    boxShadow: HOVER_SHADOW,
    duration: 0.3,
    ease: EASE_OUT,
    transformPerspective: 1000,
    transformOrigin: 'center'
  })
}

/** hover 离开：复位（含倾斜归零） */
function handleLeave(): void {
  if (prefersReducedMotion() || !props.hover || !cardRef.value) return
  gsap.to(cardRef.value, {
    y: 0,
    scale: 1,
    rotateX: 0,
    rotateY: 0,
    boxShadow: REST_SHADOW,
    duration: 0.3,
    ease: EASE_OUT
  })
}

/** 鼠标移动：驱动轻微 3D 倾斜 */
function handleMouseMove(e: MouseEvent): void {
  if (!props.hover || !cardRef.value) return
  const rect = cardRef.value.getBoundingClientRect()
  const px = (e.clientX - rect.left) / rect.width
  const py = (e.clientY - rect.top) / rect.height
  const rotateY = (px - 0.5) * 8
  const rotateX = -(py - 0.5) * 8
  gsap.to(cardRef.value, {
    rotateX,
    rotateY,
    duration: 0.3,
    ease: 'power2.out',
    transformPerspective: 1000,
    transformOrigin: 'center'
  })
}

// 用 context 包装入场动画：卸载时自动 revert
context(() => {
  onMounted(() => {
    // 绑定 mousemove 倾斜（尊重 prefers-reduced-motion）
    if (!prefersReducedMotion() && props.hover && cardRef.value) {
      cardRef.value.addEventListener('mousemove', handleMouseMove)
    }
    // 入场动画
    if (!props.appear) return
    matchMedia((_ctx, isReduce) => {
      if (!cardRef.value) return
      if (isReduce) {
        gsap.set(cardRef.value, { clearProps: 'all' })
        return
      }
      gsap.from(cardRef.value, {
        y: 20,
        opacity: 0,
        duration: 0.5,
        ease: EASE_OUT
      })
    })
  })

  onBeforeUnmount(() => {
    if (cardRef.value) {
      cardRef.value.removeEventListener('mousemove', handleMouseMove)
      gsap.killTweensOf(cardRef.value)
    }
  })
})
</script>

<template>
  <div
    ref="cardRef"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
    :class="[
      'bg-white rounded-2xl shadow-card',
      paddingClasses[props.padding],
      props.hover && 'cursor-pointer'
    ]"
  >
    <slot />
  </div>
</template>
