<script setup lang="ts">
/** 行程详情页 - 通过分享码加载并展示已保存的行程 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Plan } from '@weekend-planner/shared'
import { fetchPlanByCode } from '@/composables/useShare'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import ShareModal from '@/components/ShareModal.vue'
import PlanTimeline from '@/components/PlanTimeline.vue'
import PlanChecklist from '@/components/PlanChecklist.vue'
import AmapMap from '@/components/AmapMap.vue'
import type { MapPoint } from '@/composables/useAmap'
import type { TransportMode } from '@shared/types'

const route = useRoute()
const router = useRouter()
// 从路由参数获取分享码
const shareCode = route.params.code as string

// 行程数据
const plan = ref<Plan | null>(null)
// 加载状态
const loading = ref(true)
// 加载错误提示
const loadError = ref('')

// 当前选中的日期 tab
const activeDay = ref(0)

// 分享弹窗显示状态
const shareModalShow = ref(false)
// 分享链接完整地址
const shareUrl = ref('')
// 分享弹窗展示的行程标题
const sharePlanTitle = ref('')
// 分享弹窗展示的行程城市
const sharePlanCity = ref('')

// 当前展示的日期行程
const currentDay = computed(() => {
  if (!plan.value || !plan.value.days.length) return null
  return plan.value.days[activeDay.value] ?? plan.value.days[0]
})

// 地图组件实例引用（用于调用 focusPoint）
const amapRef = ref<InstanceType<typeof AmapMap> | null>(null)
// 时间轴容器引用（用于点击地图标记时定位卡片）
const timelineRef = ref<HTMLDivElement | null>(null)

// 当日有坐标的行程点，用于地图展示
const mapPoints = computed<MapPoint[]>(() => {
  if (!currentDay.value) return []
  const result: MapPoint[] = []
  currentDay.value.items.forEach((item) => {
    if (item.locationLng != null && item.locationLat != null) {
      result.push({
        lng: item.locationLng,
        lat: item.locationLat,
        title: item.title,
        address: item.address,
        time: item.time,
        index: result.length
      })
    }
  })
  return result
})

// 地图点对应的原始 items 索引（用于点击联动定位到正确的卡片）
const mapPointItemIndices = computed<number[]>(() => {
  if (!currentDay.value) return []
  const indices: number[] = []
  currentDay.value.items.forEach((item, i) => {
    if (item.locationLng != null && item.locationLat != null) {
      indices.push(i)
    }
  })
  return indices
})

// 交通方式：Plan 类型不含 transport 字段，默认 mixed
const mapTransport = computed<TransportMode>(() => 'mixed')

// 窗口宽度（用于地图高度响应式切换）
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
// 地图高度：桌面端 400px，移动端 300px
const mapHeight = computed(() => (windowWidth.value < 640 ? '300px' : '400px'))

function handleResize() {
  windowWidth.value = window.innerWidth
}

// 当前高亮的卡片元素（用于清理样式）
let highlightedCard: HTMLElement | null = null

/**
 * 点击地图标记时，滚动到对应的行程卡片并高亮 2 秒
 */
function handlePointClick(mapIndex: number) {
  const itemIndex = mapPointItemIndices.value[mapIndex]
  if (itemIndex == null) return
  const container = timelineRef.value
  if (!container) return
  // PlanTimeline 中每个行程项包裹在 .relative.pl-8 中
  const wrappers = container.querySelectorAll<HTMLElement>('.relative.pl-8')
  const wrapper = wrappers[itemIndex]
  if (!wrapper) return
  // PlanItem 卡片根元素
  const card = wrapper.querySelector<HTMLElement>('.bg-white.rounded-2xl.p-5')
  if (!card) return

  // 清除上一个高亮
  clearHighlight()

  // 滚动到卡片
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // 临时添加高亮样式（ring + scale）
  card.style.boxShadow = '0 0 0 4px #FF6B6B, 0 8px 20px rgba(255, 107, 107, 0.3)'
  card.style.transform = 'scale(1.03)'
  highlightedCard = card

  // 2 秒后移除高亮
  setTimeout(() => {
    if (highlightedCard === card) {
      clearHighlight()
    }
  }, 2000)
}

/** 清除卡片高亮样式 */
function clearHighlight() {
  if (highlightedCard) {
    highlightedCard.style.boxShadow = ''
    highlightedCard.style.transform = ''
    highlightedCard = null
  }
}

// 切换日期 tab
function switchDay(idx: number) {
  activeDay.value = idx
}

// 返回上一页，无历史时回到我的行程
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'history' })
  }
}

// 生成分享链接并弹出模态框
// 行程已保存过，直接用已有的 shareCode 生成链接，无需再调 savePlan
function handleShare() {
  if (!plan.value) return
  shareUrl.value = `${window.location.origin}/join/${shareCode}`
  sharePlanTitle.value = plan.value.title
  sharePlanCity.value = plan.value.city
  shareModalShow.value = true
}

// 关闭分享弹窗
function closeShareModal() {
  shareModalShow.value = false
}

// 页面挂载时加载行程
onMounted(async () => {
  window.addEventListener('resize', handleResize)
  try {
    const data = await fetchPlanByCode(shareCode)
    plan.value = data.plan
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '行程不存在或分享码无效'
  } finally {
    loading.value = false
  }
})

// 离开页面时清理事件监听
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="min-h-screen relative overflow-hidden">
    <!-- 装饰背景 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-mint/10 blur-3xl" />
      <div class="absolute bottom-20 -left-20 w-80 h-80 rounded-full bg-coral/10 blur-3xl" />
    </div>

    <div class="relative max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <!-- 顶部操作栏 -->
      <div class="flex items-center justify-between mb-6">
        <button
          @click="goBack"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-navy/60 hover:text-coral transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <BaseButton
          v-if="plan"
          variant="secondary"
          size="sm"
          @click="handleShare"
        >
          🔗 分享链接
        </BaseButton>
      </div>

      <!-- 加载中 -->
      <BaseCard v-if="loading" padding="lg" class="text-center">
        <div class="inline-block w-8 h-8 border-2 border-coral border-t-transparent rounded-full animate-spin mb-3" />
        <p class="text-sm text-navy/60">正在加载行程信息...</p>
      </BaseCard>

      <!-- 加载失败 -->
      <div v-else-if="loadError" class="text-center py-16">
        <div class="text-5xl mb-4">😕</div>
        <h2 class="text-xl font-bold text-navy mb-2">无法查看行程</h2>
        <p class="text-navy/50 mb-6">{{ loadError }}</p>
        <BaseButton @click="router.push({ name: 'home' })">返回首页</BaseButton>
      </div>

      <!-- 行程展示 -->
      <div v-else-if="plan" class="space-y-6">
        <!-- 行程头部 -->
        <BaseCard padding="lg" class="relative overflow-hidden sm:rounded-3xl">
          <!-- 装饰渐变背景 -->
          <div class="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full bg-coral/10 blur-3xl" />
          <div class="pointer-events-none absolute -bottom-20 -left-16 w-48 h-48 rounded-full bg-mint/10 blur-3xl" />

          <div class="relative flex flex-wrap items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-coral/10 text-coral text-xs font-semibold mb-3">
                📍 {{ plan.city }}
              </div>
              <h1 class="font-display text-2xl sm:text-3xl font-bold text-navy mb-2">
                {{ plan.title }}
              </h1>
              <p class="text-navy/60 leading-relaxed">{{ plan.summary }}</p>
            </div>
            <div class="flex flex-col items-end gap-2">
              <div class="px-4 py-2 rounded-xl bg-navy text-white text-right">
                <p class="text-xs text-white/60">总花费</p>
                <p class="text-2xl font-bold text-amber">¥{{ plan.totalCost }}</p>
              </div>
              <p class="text-xs text-navy/40">预算 ¥{{ plan.budget }}</p>
            </div>
          </div>

          <!-- 天气信息：渐变背景 + 边框 + 更大图标 -->
          <div
            v-if="plan.weather"
            class="relative mt-4 flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-mint/10 to-mint/5 border border-mint/20"
          >
            <span class="text-3xl shrink-0">🌤️</span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-navy">
                {{ plan.weather.condition }} · {{ plan.weather.temperature }}
              </p>
              <p class="text-xs text-navy/60 mt-0.5">{{ plan.weather.suggestion }}</p>
            </div>
          </div>
        </BaseCard>

        <!-- 每日行程 -->
        <div v-if="plan.days.length">
          <!-- 日期切换 tab -->
          <div v-if="plan.days.length > 1" class="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              v-for="(day, i) in plan.days"
              :key="i"
              @click="switchDay(i)"
              :class="[
                'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 outline-none',
                'focus-visible:ring-4 focus-visible:ring-coral/25',
                activeDay === i
                  ? 'bg-coral text-white shadow-md'
                  : 'bg-white text-navy/60 hover:text-navy shadow-card'
              ]"
            >
              第 {{ day.day }} 天
            </button>
          </div>

          <!-- 当日路线地图 -->
          <div v-if="currentDay" class="mb-4">
            <h3 class="font-bold text-navy mb-3 flex items-center gap-2">
              <span class="w-8 h-8 grid place-items-center rounded-lg bg-coral/15">📍</span>
              当日路线地图
            </h3>
            <AmapMap
              v-if="mapPoints.length > 0"
              ref="amapRef"
              :points="mapPoints"
              :transport="mapTransport"
              :height="mapHeight"
              @point-click="handlePointClick"
            />
            <div
              v-else
              class="bg-white rounded-2xl p-6 shadow-card text-center text-navy/50 text-sm"
            >
              暂无地图数据
            </div>
          </div>

          <!-- 时间轴 -->
          <BaseCard padding="md">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-navy">
                第 {{ currentDay?.day }} 天行程
              </h3>
              <span v-if="currentDay" class="text-sm text-navy/50">{{ currentDay.date }}</span>
            </div>
            <div ref="timelineRef">
              <PlanTimeline v-if="currentDay" :day="currentDay" />
            </div>
          </BaseCard>
        </div>

        <!-- 出行清单 -->
        <div>
          <h3 class="font-bold text-navy mb-3 flex items-center gap-2">
            <span class="w-8 h-8 grid place-items-center rounded-lg bg-amber/20">📋</span>
            出行准备清单
          </h3>
          <PlanChecklist :checklist="plan.checklist" />
        </div>
      </div>
    </div>

    <!-- 分享弹窗 -->
    <ShareModal
      :show="shareModalShow"
      :share-url="shareUrl"
      :plan-title="sharePlanTitle"
      :plan-city="sharePlanCity"
      @close="closeShareModal"
    />
  </div>
</template>
