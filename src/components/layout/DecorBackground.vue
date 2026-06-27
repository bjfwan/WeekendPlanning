<script setup lang="ts">
/** 统一装饰背景 - 3 个模糊圆 + 漂浮动画 + 鼠标视差 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useGsap } from '@/composables/useGsap'

interface Props {
  /** minimal 只显示 2 个圆，用于内容密集页 */
  variant?: 'default' | 'minimal'
}

withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const { gsap, context } = useGsap()

// 3 个模糊圆内层引用（外层承载 CSS 浮动动画，内层承载 GSAP 视差 transform，避免 transform 冲突）
const circle1Ref = ref<HTMLElement>()
const circle2Ref = ref<HTMLElement>()
const circle3Ref = ref<HTMLElement>()

// 鼠标视差的 quickTo 函数（高性能鼠标跟随）
type QuickTo = (value: number) => void
let xTo1: QuickTo | null = null
let yTo1: QuickTo | null = null
let xTo2: QuickTo | null = null
let yTo2: QuickTo | null = null
let xTo3: QuickTo | null = null
let yTo3: QuickTo | null = null

// matchMedia 实例（用于卸载时清理）
let mm: gsap.MatchMedia | null = null

/** 鼠标移动事件处理：3 个圆不同偏移系数形成深度感 */
function onMouseMove(e: MouseEvent) {
  // 计算鼠标相对视口中心的归一化偏移（-1 到 1）
  const x = (e.clientX / window.innerWidth - 0.5) * 2
  const y = (e.clientY / window.innerHeight - 0.5) * 2

  // 圆1（大/远）：偏移系数 20，响应较慢
  xTo1?.(x * 20)
  yTo1?.(y * 20)
  // 圆2（大/中）：偏移系数 30，响应适中
  xTo2?.(x * 30)
  yTo2?.(y * 30)
  // 圆3（小/近）：偏移系数 45，响应最快
  xTo3?.(x * 45)
  yTo3?.(y * 45)
}

onMounted(() => {
  // 用 context 包装所有 GSAP 动画，便于卸载时统一 revert
  context(() => {
    // 桌面端 + 非 reduced-motion 才启用鼠标视差
    mm = gsap.matchMedia()
    mm.add(
      '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
      () => {
        // 为每个圆创建 quickTo 函数（高性能，避免每次 mousemove 创建新 tween）
        xTo1 = gsap.quickTo(circle1Ref.value!, 'x', { duration: 1.0, ease: 'power3' })
        yTo1 = gsap.quickTo(circle1Ref.value!, 'y', { duration: 1.0, ease: 'power3' })
        xTo2 = gsap.quickTo(circle2Ref.value!, 'x', { duration: 0.8, ease: 'power3' })
        yTo2 = gsap.quickTo(circle2Ref.value!, 'y', { duration: 0.8, ease: 'power3' })
        if (circle3Ref.value) {
          xTo3 = gsap.quickTo(circle3Ref.value, 'x', { duration: 0.6, ease: 'power3' })
          yTo3 = gsap.quickTo(circle3Ref.value, 'y', { duration: 0.6, ease: 'power3' })
        }

        window.addEventListener('mousemove', onMouseMove)

        // 媒体查询不再匹配时清理（如缩放到移动端）
        return () => {
          window.removeEventListener('mousemove', onMouseMove)
          xTo1 = null
          yTo1 = null
          xTo2 = null
          yTo2 = null
          xTo3 = null
          yTo3 = null
        }
      }
    )
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  mm?.revert()
})
</script>

<template>
  <div
    class="absolute inset-0 z-0 pointer-events-none overflow-hidden"
    aria-hidden="true"
  >
    <!-- 圆1：左上角（外层定位+浮动，内层视差） -->
    <div
      class="absolute -top-24 -left-32 w-96 h-96 animate-float-slow"
      style="animation-delay: 0s"
    >
      <div
        ref="circle1Ref"
        class="w-full h-full rounded-full bg-coral/5 sm:bg-coral/10 sm:blur-3xl"
      />
    </div>
    <!-- 圆2：右上角 -->
    <div
      class="absolute top-32 -right-32 w-96 h-96 animate-float-slow"
      style="animation-delay: 4s"
    >
      <div
        ref="circle2Ref"
        class="w-full h-full rounded-full bg-mint/5 sm:bg-mint/10 sm:blur-3xl"
      />
    </div>
    <!-- 圆3：右下角（minimal 模式不显示） -->
    <div
      v-if="variant === 'default'"
      class="absolute bottom-0 left-3/4 w-64 h-64 animate-float-slow"
      style="animation-delay: 8s"
    >
      <div
        ref="circle3Ref"
        class="w-full h-full rounded-full bg-amber/5 sm:bg-amber/10 sm:blur-3xl"
      />
    </div>
  </div>
</template>
