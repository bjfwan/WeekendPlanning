<script setup lang="ts">
/** 顶部导航栏 - Logo + 导航 + 页面操作 slot */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft } from '@lucide/vue'
import { useGsap } from '@/composables/useGsap'

interface Props {
  /** 是否显示返回箭头（PlanView/PlanDetailView 用） */
  showBack?: boolean
}

interface Emits {
  (e: 'back'): void
}

const props = withDefaults(defineProps<Props>(), {
  showBack: false
})

const emit = defineEmits<Emits>()

const route = useRoute()
const router = useRouter()

const { gsap, matchMedia, EASE_OUT } = useGsap()

const navItems = [
  { name: 'home', label: '首页' },
  { name: 'history', label: '我的行程' }
] as const

function isActive(name: string): boolean {
  if (name === 'home') return route.name === 'home'
  if (name === 'history') {
    return ['history', 'plan', 'plan-detail'].includes(route.name as string)
  }
  return false
}

function goHome() {
  router.push({ name: 'home' })
}

function handleBack() {
  emit('back')
}

// DOM 引用
const headerRef = ref<HTMLElement>()
const navRef = ref<HTMLElement>()
const indicatorRef = ref<HTMLElement>()

// matchMedia 实例引用（用于卸载时清理）
let mm: ReturnType<typeof matchMedia> | null = null

/** 移动 active 下划线指示条到当前激活的导航项 */
function moveIndicator() {
  if (!indicatorRef.value || !navRef.value) return
  const activeEl = navRef.value.querySelector<HTMLElement>('[data-active="true"]')
  if (!activeEl) {
    // 无激活项：隐藏指示条
    gsap.to(indicatorRef.value, {
      width: 0,
      opacity: 0,
      duration: 0.3,
      ease: EASE_OUT
    })
    return
  }
  const navRect = navRef.value.getBoundingClientRect()
  const activeRect = activeEl.getBoundingClientRect()
  const x = activeRect.left - navRect.left
  const width = activeRect.width
  gsap.to(indicatorRef.value, {
    x,
    width,
    opacity: 1,
    duration: 0.4,
    ease: EASE_OUT
  })
}

onMounted(() => {
  // 用 matchMedia 处理 prefers-reduced-motion
  mm = matchMedia((_ctx, isReduce) => {
    if (!headerRef.value) return
    if (isReduce) {
      // 减少动态效果：即时显示，不播放入场动画
      gsap.set(headerRef.value, { y: 0, opacity: 1 })
      nextTick(moveIndicator)
      return
    }
    // 从顶部滑入
    gsap.from(headerRef.value, {
      y: -60,
      opacity: 0,
      duration: 0.6,
      ease: EASE_OUT
    })
    // 定位指示条到当前激活项
    nextTick(moveIndicator)
  })
})

// 路由变化时平滑移动指示条
watch(
  () => route.name,
  () => {
    nextTick(moveIndicator)
  }
)

onBeforeUnmount(() => {
  mm?.revert()
})
</script>

<template>
  <header
    ref="headerRef"
    class="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-navy/5"
    :style="{ paddingTop: 'env(safe-area-inset-top)' }"
  >
    <div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 sm:h-16">
      <!-- 左侧：返回箭头 或 Logo -->
      <div class="flex items-center">
        <button
          v-if="showBack"
          type="button"
          class="flex items-center justify-center w-9 h-9 -ml-2 rounded-full text-navy/70 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
          aria-label="返回"
          @click="handleBack"
        >
          <ChevronLeft :size="22" />
        </button>
        <button
          v-else
          type="button"
          class="flex items-center gap-2 cursor-pointer"
          aria-label="返回首页"
          @click="goHome"
        >
          <!-- Logo：复用 favicon 的太阳/罗盘 SVG -->
          <svg
            width="32"
            height="32"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
            class="shrink-0"
          >
            <circle cx="24" cy="24" r="18" fill="#FFD93D" />
            <text
              x="24"
              y="29"
              text-anchor="middle"
              font-size="14"
              font-family="Arial"
              font-weight="900"
              fill="#1A1A2E"
            >AI</text>
          </svg>
          <span
            class="hidden sm:inline text-lg text-navy leading-none"
            style="font-family: 'ZCOOL KuaiLe', cursive"
          >
            AI 周末规划师
          </span>
        </button>
      </div>

      <!-- 中间：导航项（桌面端显示） -->
      <nav ref="navRef" class="hidden sm:flex items-center gap-6 relative">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="relative py-1 text-sm font-medium transition-colors"
          :data-active="isActive(item.name)"
          :class="isActive(item.name) ? 'text-coral' : 'text-navy/60 hover:text-navy'"
        >
          {{ item.label }}
        </router-link>
        <!-- 滑动指示条（由 gsap 控制位置和宽度，类似 iOS tab 指示条） -->
        <span
          ref="indicatorRef"
          class="absolute bottom-0 left-0 h-0.5 rounded-full bg-coral pointer-events-none"
          style="width: 0; opacity: 0"
        />
      </nav>

      <!-- 右侧：slot（页面级操作按钮） -->
      <div class="flex items-center gap-2">
        <slot />
      </div>
    </div>
  </header>
</template>
