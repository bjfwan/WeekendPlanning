<script setup lang="ts">
/** 极简页脚 - 版权信息 + 链接 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useGsap } from '@/composables/useGsap'

const { gsap, matchMedia, EASE_OUT, EASE_ELASTIC } = useGsap()

const footerRef = ref<HTMLElement>()

// matchMedia 实例引用（用于卸载时清理）
let mm: ReturnType<typeof matchMedia> | null = null

/** 是否启用动画（尊重 prefers-reduced-motion） */
const enableMotion = ref(true)

onMounted(() => {
  // 用 matchMedia 处理 prefers-reduced-motion
  mm = matchMedia((_ctx, isReduce) => {
    enableMotion.value = !isReduce
    if (!footerRef.value) return
    if (isReduce) {
      // 减少动态效果：即时显示，不播放入场动画
      gsap.set(footerRef.value, { y: 0, opacity: 1 })
      return
    }
    // 从底部滑入
    gsap.from(footerRef.value, {
      y: 30,
      opacity: 0,
      duration: 0.6,
      delay: 0.2,
      ease: EASE_OUT
    })
  })
})

/** 链接 hover 弹性效果 */
function onLinkEnter(e: MouseEvent) {
  if (!enableMotion.value) return
  const target = e.currentTarget as HTMLElement
  gsap.to(target, {
    y: -4,
    scale: 1.05,
    duration: 0.4,
    ease: EASE_ELASTIC
  })
}

/** 链接 hover 离开：回弹复位 */
function onLinkLeave(e: MouseEvent) {
  if (!enableMotion.value) return
  const target = e.currentTarget as HTMLElement
  gsap.to(target, {
    y: 0,
    scale: 1,
    duration: 0.3,
    ease: EASE_OUT
  })
}

onBeforeUnmount(() => {
  mm?.revert()
})
</script>

<template>
  <footer
    ref="footerRef"
    class="py-6 border-t border-navy/5"
  >
    <div class="max-w-6xl mx-auto px-4 flex items-center justify-between text-sm text-navy/40">
      <p>© 2026 AI 周末规划师 · 由 AI 驱动</p>
      <div class="flex items-center gap-3">
        <a
          href="#"
          class="hover:text-coral transition-colors inline-block"
          @mouseenter="onLinkEnter"
          @mouseleave="onLinkLeave"
        >隐私</a>
        <span class="text-navy/20">·</span>
        <a
          href="#"
          class="hover:text-coral transition-colors inline-block"
          @mouseenter="onLinkEnter"
          @mouseleave="onLinkLeave"
        >反馈</a>
      </div>
    </div>
  </footer>
</template>
