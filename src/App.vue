<script setup lang="ts">
/** AI 周末规划师 - 根组件（layout 骨架） */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import DecorBackground from '@/components/layout/DecorBackground.vue'
import { useGsap } from '@/composables/useGsap'

const { gsap, matchMedia, EASE_OUT, EASE_IN_OUT } = useGsap()

const route = useRoute()

// JoinView 路由需要居中布局，不应用 max-w-6xl 容器
const isCentered = computed(() => route.meta.layout === 'centered')

/** 路由过渡方向 */
type TransitionDir = 'forward' | 'back' | 'modal' | 'up' | 'fade'

/** 根据前后路由名称判断过渡方向 */
function getDirection(from: string | undefined, to: string | undefined): TransitionDir {
  // 任意 → join：模态感（scale + 淡入淡出）
  if (to === 'join') return 'modal'
  // 任意 → history：层级变化（向上滑出 / 从下滑入）
  if (to === 'history') return 'up'
  // home → plan：前进感（向左滑出 / 从右滑入）
  if (from === 'home' && to === 'plan') return 'forward'
  // plan → home：返回感（向右滑出 / 从左滑入）
  if (from === 'plan' && to === 'home') return 'back'
  // 其他：淡入淡出
  return 'fade'
}

/** 当前过渡方向（在路由变化时更新，供 transition 钩子读取） */
const direction = ref<TransitionDir>('fade')

/** 是否启用动画（尊重 prefers-reduced-motion） */
const enableMotion = ref(true)

// 通过 matchMedia 处理 prefers-reduced-motion：仅更新开关，不创建持久动画
matchMedia((_, isReduce) => {
  enableMotion.value = !isReduce
})

// 监听路由变化，在 DOM 更新前更新过渡方向
watch(
  () => route.name,
  (newName, oldName) => {
    direction.value = getDirection(oldName as string, newName as string)
  },
  { flush: 'pre' }
)

/** 进入前：设置入场初始状态（防止自然状态闪烁） */
function onBeforeEnter(el: Element) {
  if (!enableMotion.value) return
  const dir = direction.value
  if (dir === 'forward') gsap.set(el, { opacity: 0, x: 40, y: 0, scale: 1 })
  else if (dir === 'back') gsap.set(el, { opacity: 0, x: -40, y: 0, scale: 1 })
  else if (dir === 'modal') gsap.set(el, { opacity: 0, x: 0, y: 0, scale: 1.05 })
  else if (dir === 'up') gsap.set(el, { opacity: 0, x: 0, y: 40, scale: 1 })
  else gsap.set(el, { opacity: 0, x: 0, y: 0, scale: 1 })
}

/** 路由进入钩子：从初始状态动画到自然状态 */
function onEnter(el: Element, done: () => void) {
  // 减少动态效果：即时显示，不播放动画
  if (!enableMotion.value) {
    gsap.set(el, { opacity: 1, x: 0, y: 0, scale: 1 })
    done()
    return
  }
  gsap.timeline({ onComplete: done }).to(el, {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    duration: 0.4,
    ease: EASE_OUT
  })
}

/** 路由离开钩子：根据方向编排离场动画 */
function onLeave(el: Element, done: () => void) {
  // 减少动态效果：即时隐藏，不播放动画
  if (!enableMotion.value) {
    gsap.set(el, { opacity: 0 })
    done()
    return
  }
  const dir = direction.value
  const tl = gsap.timeline({ onComplete: done })
  if (dir === 'forward') {
    // 向左滑出 + 淡出（前进感）
    tl.to(el, { opacity: 0, x: -40, duration: 0.3, ease: EASE_IN_OUT })
  } else if (dir === 'back') {
    // 向右滑出 + 淡出（返回感）
    tl.to(el, { opacity: 0, x: 40, duration: 0.3, ease: EASE_IN_OUT })
  } else if (dir === 'modal') {
    // scale 0.95 + 淡出（模态感）
    tl.to(el, { opacity: 0, scale: 0.95, duration: 0.3, ease: EASE_IN_OUT })
  } else if (dir === 'up') {
    // 向上滑出 + 淡出（层级变化）
    tl.to(el, { opacity: 0, y: -40, duration: 0.3, ease: EASE_IN_OUT })
  } else {
    // 默认淡出
    tl.to(el, { opacity: 0, duration: 0.2, ease: EASE_IN_OUT })
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-cream">
    <AppHeader />
    <main class="flex-1 relative overflow-hidden">
      <DecorBackground />
      <div
        class="relative z-10 mx-auto px-4 py-8 sm:py-12"
        :class="isCentered ? '' : 'max-w-6xl'"
      >
        <router-view v-slot="{ Component }">
          <Transition :css="false" mode="out-in" @before-enter="onBeforeEnter" @enter="onEnter" @leave="onLeave">
            <component :is="Component" />
          </Transition>
        </router-view>
      </div>
    </main>
    <AppFooter />
  </div>
</template>
