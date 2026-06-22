<script setup lang="ts">
/** 行程结果页 - 接收表单数据，流式生成并展示行程 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlan, planRequest } from '@/composables/usePlan'
import { useAuth } from '@/composables/useAuth'
import { savePlan } from '@/composables/useShare'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import ShareModal from '@/components/ShareModal.vue'
import PlanTimeline from '@/components/PlanTimeline.vue'
import PlanChecklist from '@/components/PlanChecklist.vue'
import StreamingPanel from '@/components/StreamingPanel.vue'
import AmapMap from '@/components/AmapMap.vue'
import type { MapPoint } from '@/composables/useAmap'
import type { TransportMode, PlanItem } from '@weekend-planner/shared'
import { haversineDistance, isValidChinaCoordinate } from '@weekend-planner/shared/utils'

const router = useRouter()
const { content, reasoning, plan, status, error, enrichProgress, generatePlan, retry, cancel } = usePlan()
const { user, ensureSession } = useAuth()

// 当前选中的日期 tab
const activeDay = ref(0)

// 路线排序方式：'time' 按时间顺序，'geo' 按地理顺序（默认按地理，后端已重排）
const routeOrder = ref<'time' | 'geo'>('geo')

// 跨日距离提示：切换日期 tab 时，如果当日起点距上一日终点超过 20km，显示提示
const crossDayDistance = ref(0)
const showCrossDayTip = ref(false)
let crossDayTipTimer: ReturnType<typeof setTimeout> | null = null

// 分享错误提示
const shareError = ref('')
// 分享中加载状态
const sharing = ref(false)
// 分享弹窗显示状态
const shareModalShow = ref(false)
// 分享链接完整地址
const shareUrl = ref('')
// 分享弹窗展示的行程标题
const sharePlanTitle = ref('')
// 分享弹窗展示的行程城市
const sharePlanCity = ref('')

// 自动保存状态：done 后自动保存到 Supabase，失败时提示用户但不阻断
const autoSaveError = ref('')
let autoSaveErrorTimer: ReturnType<typeof setTimeout> | null = null

// 生成完成的庆祝动画状态（done 时短暂展示 ✓ 与闪光）
const showCelebration = ref(false)
let celebrationTimer: ReturnType<typeof setTimeout> | null = null

// StreamingPanel 延迟隐藏：done 后保留 500ms 让内部 watch(status) 触发强制滚动，
// 之后自动隐藏以展示行程结果；新一轮生成时重置为 true
const showStreamingPanel = ref(true)
let streamingPanelHideTimer: ReturnType<typeof setTimeout> | null = null

// 是否有有效的表单数据
const hasRequest = computed(() => planRequest.value !== null)

// 当前行程数据
const currentPlan = computed(() => plan.value)

// StreamingPanel 的 status 仅接受 'streaming' | 'done'，将 usePlan 的 status 映射过去
// 'idle'/'error' 时回退为 'streaming'（此时组件通过 v-if 不挂载，值不影响）
const panelStatus = computed<'streaming' | 'done'>(() =>
  status.value === 'done' ? 'done' : 'streaming'
)

// 当前展示的日期行程
const currentDay = computed(() => {
  if (!currentPlan.value || !currentPlan.value.days.length) return null
  return currentPlan.value.days[activeDay.value] ?? currentPlan.value.days[0]
})

// 地图组件实例引用（用于调用 focusPoint）
const amapRef = ref<InstanceType<typeof AmapMap> | null>(null)
// 时间轴容器引用（用于点击地图标记时定位卡片）
const timelineRef = ref<HTMLDivElement | null>(null)

// 当前排序方式下用于地图展示的 items
// - 'time'：优先用 originalItems（后端保存的原始时间顺序），兜底 items
// - 'geo'：用 items（后端已按地理最近邻重排）
const routeItems = computed<PlanItem[]>(() => {
  const day = currentDay.value
  if (!day) return []
  if (routeOrder.value === 'time') {
    const original = day.originalItems
    return original ?? day.items
  }
  return day.items
})

// 当日有坐标的行程点，用于地图展示
const mapPoints = computed<MapPoint[]>(() => {
  const result: MapPoint[] = []
  routeItems.value.forEach((item) => {
    if (isValidChinaCoordinate(item.locationLng, item.locationLat)) {
      result.push({
        lng: item.locationLng as number,
        lat: item.locationLat as number,
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
  const indices: number[] = []
  routeItems.value.forEach((routeItem, routeIdx) => {
    if (isValidChinaCoordinate(routeItem.locationLng, routeItem.locationLat)) {
      // 时间轴现在用 routeItems 渲染，所以索引就是 routeItems 中的位置
      indices.push(routeIdx)
    }
  })
  return indices
})

// 跨日连线：上一日最后一个有坐标的 item 坐标
// 切换日期 tab 时，传给 AmapMap 画一条从上一日终点到当日起点的浅色虚线
const crossDayPoint = computed<{ lng: number; lat: number } | null>(() => {
  if (activeDay.value <= 0) return null
  const prevDay = currentPlan.value?.days[activeDay.value - 1]
  if (!prevDay) return null
  // 与当前排序方式保持一致：'time' 用 originalItems，'geo' 用 items
  const prevItems = routeOrder.value === 'time'
    ? (prevDay.originalItems ?? prevDay.items)
    : prevDay.items
  for (let i = prevItems.length - 1; i >= 0; i--) {
    const item = prevItems[i]
    if (isValidChinaCoordinate(item.locationLng, item.locationLat)) {
      return { lng: item.locationLng as number, lat: item.locationLat as number }
    }
  }
  return null
})

// 交通方式：优先用表单请求中的 transport，否则默认 mixed
const mapTransport = computed<TransportMode>(() => {
  return planRequest.value?.transport ?? 'mixed'
})

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

// 监听生成状态：done 时保存 transport 到 plan、自动保存到 Supabase 并触发庆祝动画
watch(status, async (newStatus) => {
  if (newStatus === 'done') {
    // 保存用户选择的交通方式到 plan，供 PlanDetailView 恢复使用
    if (plan.value && planRequest.value?.transport) {
      plan.value = { ...plan.value, transport: planRequest.value.transport }
    }

    // 立即触发庆祝动画（不等待保存，避免延迟用户体验）
    showCelebration.value = true
    if (celebrationTimer) clearTimeout(celebrationTimer)
    celebrationTimer = setTimeout(() => {
      showCelebration.value = false
    }, 2000)

    // 自动保存到 Supabase（不阻断行程查看）
    if (plan.value) {
      try {
        let userId = user.value?.id
        // 用户身份未就绪时，尝试重新登录
        if (!userId) {
          await ensureSession()
          userId = user.value?.id
        }
        if (userId) {
          const result = await savePlan(plan.value, userId)
          console.log('[PlanView] 行程已自动保存，分享码:', result.shareCode)
        } else {
          console.warn('[PlanView] 用户身份未就绪，跳过自动保存')
          showAutoSaveError('自动保存失败：用户身份未就绪，可点击"分享链接"重试')
        }
      } catch (err) {
        console.error('[PlanView] 自动保存失败:', err)
        showAutoSaveError('自动保存失败，可点击"分享链接"重试')
      }
    }

    // 延迟隐藏 StreamingPanel：留 500ms 让组件内 watch(status) 触发强制滚动到底部，
    // 之后自动隐藏以展示行程结果
    if (streamingPanelHideTimer) clearTimeout(streamingPanelHideTimer)
    streamingPanelHideTimer = setTimeout(() => {
      showStreamingPanel.value = false
    }, 500)
  } else {
    showCelebration.value = false
    // 新一轮生成或重置：重新显示 StreamingPanel，并清除待执行的隐藏定时器
    // 避免上一轮 done 的 setTimeout 在 streaming 期间误触发隐藏
    if (streamingPanelHideTimer) {
      clearTimeout(streamingPanelHideTimer)
      streamingPanelHideTimer = null
    }
    showStreamingPanel.value = true
  }
})

/**
 * 显示自动保存错误提示，3 秒后自动消失
 */
function showAutoSaveError(message: string) {
  autoSaveError.value = message
  if (autoSaveErrorTimer) clearTimeout(autoSaveErrorTimer)
  autoSaveErrorTimer = setTimeout(() => {
    autoSaveError.value = ''
  }, 3000)
}

// 切换日期 tab
function switchDay(idx: number) {
  activeDay.value = idx
}

/**
 * 获取指定日期 tab 在当前排序方式下的路线 items
 */
function getDayRouteItems(dayIdx: number): PlanItem[] {
  if (!currentPlan.value) return []
  if (dayIdx < 0 || dayIdx >= currentPlan.value.days.length) return []
  const day = currentPlan.value.days[dayIdx]
  if (routeOrder.value === 'time') {
    const original = day.originalItems
    return original ?? day.items
  }
  return day.items
}

/**
 * 计算当日起点与上一日终点的跨日距离，超过 20km 时显示提示
 */
function updateCrossDayTip() {
  showCrossDayTip.value = false
  crossDayDistance.value = 0
  if (crossDayTipTimer) {
    clearTimeout(crossDayTipTimer)
    crossDayTipTimer = null
  }

  const dayIdx = activeDay.value
  if (dayIdx <= 0) return

  const prevItems = getDayRouteItems(dayIdx - 1)
  const currItems = getDayRouteItems(dayIdx)

  // 上一日最后一个有坐标的 item
  let prevLast: PlanItem | null = null
  for (let i = prevItems.length - 1; i >= 0; i--) {
    if (prevItems[i].locationLng != null && prevItems[i].locationLat != null) {
      prevLast = prevItems[i]
      break
    }
  }
  if (!prevLast || prevLast.locationLng == null || prevLast.locationLat == null) return

  // 当日第一个有坐标的 item
  let currFirst: PlanItem | null = null
  for (const item of currItems) {
    if (item.locationLng != null && item.locationLat != null) {
      currFirst = item
      break
    }
  }
  if (!currFirst || currFirst.locationLng == null || currFirst.locationLat == null) return

  const dist = haversineDistance(
    prevLast.locationLng,
    prevLast.locationLat,
    currFirst.locationLng,
    currFirst.locationLat
  )

  if (dist > 20) {
    crossDayDistance.value = Math.round(dist)
    showCrossDayTip.value = true
    crossDayTipTimer = setTimeout(() => {
      showCrossDayTip.value = false
      crossDayTipTimer = null
    }, 5000)
  }
}

// 切换日期 tab 时计算跨日距离提示
watch(activeDay, () => {
  updateCrossDayTip()
})

// 重新生成
function handleRetry() {
  if (!planRequest.value) return
  activeDay.value = 0
  retry(planRequest.value)
}

// 返回首页修改
function goHome() {
  cancel()
  router.push({ name: 'home' })
}

// 生成分享链接并弹出模态框
async function handleShare() {
  if (!currentPlan.value) return
  shareError.value = ''
  sharing.value = true
  try {
    // 调用后端保存行程，获取真实分享码
    const userId = user.value?.id
    if (!userId) {
      throw new Error('用户身份未就绪，请稍后重试')
    }
    const { shareCode } = await savePlan(currentPlan.value, userId)
    // 生成完整分享链接
    shareUrl.value = `${window.location.origin}/join/${shareCode}`
    // 记录行程信息用于弹窗展示
    sharePlanTitle.value = currentPlan.value.title
    sharePlanCity.value = currentPlan.value.city
    // 弹出分享弹窗（复制操作改由弹窗内按钮处理）
    shareModalShow.value = true
  } catch (err) {
    shareError.value = err instanceof Error ? err.message : '生成分享链接失败'
    setTimeout(() => (shareError.value = ''), 3000)
  } finally {
    sharing.value = false
  }
}

// 关闭分享弹窗
function closeShareModal() {
  shareModalShow.value = false
}

// 页面挂载时自动开始生成
onMounted(() => {
  window.addEventListener('resize', handleResize)
  if (planRequest.value) {
    generatePlan(planRequest.value)
  }
})

// 离开页面时取消请求并清理定时器
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  cancel()
  if (celebrationTimer) clearTimeout(celebrationTimer)
  if (crossDayTipTimer) clearTimeout(crossDayTipTimer)
  if (autoSaveErrorTimer) clearTimeout(autoSaveErrorTimer)
  if (streamingPanelHideTimer) clearTimeout(streamingPanelHideTimer)
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
      <!-- 无表单数据时引导返回 -->
      <div v-if="!hasRequest" class="text-center py-20">
        <div class="text-6xl mb-4">🧭</div>
        <h2 class="text-xl font-bold text-navy mb-2">还没有行程数据</h2>
        <p class="text-navy/50 mb-6">请先填写你的周末计划需求</p>
        <BaseButton @click="router.push({ name: 'home' })">返回首页</BaseButton>
      </div>

      <template v-else>
        <!-- 顶部操作栏 -->
        <div class="flex items-center justify-between mb-6">
          <button
            @click="goHome"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-navy/60 hover:text-coral transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            返回修改
          </button>
          <div class="flex items-center gap-2">
            <BaseButton
              v-if="status === 'streaming'"
              variant="ghost"
              size="sm"
              @click="cancel"
            >
              取消生成
            </BaseButton>
            <BaseButton
              v-if="status === 'done' || status === 'error'"
              variant="ghost"
              size="sm"
              @click="handleRetry"
            >
              🔄 重新生成
            </BaseButton>
            <BaseButton
              v-if="status === 'done' && currentPlan"
              variant="secondary"
              size="sm"
              :loading="sharing"
              @click="handleShare"
            >
              🔗 分享链接
            </BaseButton>
            <BaseButton
              v-if="status === 'done' && currentPlan"
              variant="ghost"
              size="sm"
              @click="router.push({ name: 'history' })"
            >
              📚 查看我的行程
            </BaseButton>
          </div>
          <!-- 分享错误提示 -->
          <p v-if="shareError" class="mt-2 text-right text-xs text-red-500">
            {{ shareError }}
          </p>
        </div>

        <!-- 自动保存错误提示（不阻断行程查看，用户可点"分享链接"重试） -->
        <Transition name="auto-save-tip">
          <div
            v-if="autoSaveError"
            class="mb-4 px-4 py-2 rounded-xl bg-amber/10 border border-amber/30 text-sm text-navy/70 flex items-center gap-2"
          >
            <span>⚠️</span>
            <span>{{ autoSaveError }}</span>
          </div>
        </Transition>

        <!-- 流式生成中：v-if 条件包含 'done'，让组件在流式结束时仍存活， -->
        <!-- 使 StreamingPanel 内 watch(status) 能触发强制滚动到底部 -->
        <!-- done 后通过 showStreamingPanel 延迟 500ms 隐藏，过渡淡出展示行程结果 -->
        <Transition name="streaming-fade">
          <StreamingPanel
            v-if="showStreamingPanel && (status === 'streaming' || status === 'done')"
            :content="content"
            :reasoning="reasoning"
            :status="panelStatus"
            :enrich-progress="enrichProgress"
          />
        </Transition>

        <!-- 生成出错 -->
        <div v-if="status === 'error'" class="text-center py-16">
          <div class="text-5xl mb-4">😵</div>
          <h2 class="text-xl font-bold text-navy mb-2">生成失败</h2>
          <p class="text-navy/50 mb-6">{{ error || '请稍后重试' }}</p>
          <BaseButton @click="handleRetry">重新生成</BaseButton>
        </div>

        <!-- 行程展示 -->
        <div v-if="status === 'done' && currentPlan" class="space-y-6">
          <!-- 行程头部 -->
          <BaseCard padding="lg" class="relative overflow-hidden sm:rounded-3xl">
            <!-- 装饰渐变背景 -->
            <div class="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full bg-coral/10 blur-3xl" />
            <div class="pointer-events-none absolute -bottom-20 -left-16 w-48 h-48 rounded-full bg-mint/10 blur-3xl" />

            <!-- 庆祝动画：✓ 徽章（done 后 2 秒消失） -->
            <Transition name="celebrate-fade">
              <div
                v-if="showCelebration"
                class="absolute top-5 right-5 z-10 w-11 h-11 grid place-items-center rounded-full bg-mint text-white shadow-lg"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </Transition>
            <!-- 庆祝动画：标题区域闪光扫过 -->
            <div
              v-if="showCelebration"
              class="pointer-events-none absolute inset-0 celebrate-sweep bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />

            <div class="relative flex flex-wrap items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-coral/10 text-coral text-xs font-semibold mb-3">
                  📍 {{ currentPlan.city }}
                </div>
                <h1 class="font-display text-2xl sm:text-3xl font-bold text-navy mb-2">
                  {{ currentPlan.title }}
                </h1>
                <p class="text-navy/60 leading-relaxed">{{ currentPlan.summary }}</p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <div class="px-4 py-2 rounded-xl bg-navy text-white text-right">
                  <p class="text-xs text-white/60">总花费</p>
                  <p class="text-2xl font-bold text-amber">¥{{ currentPlan.totalCost }}</p>
                </div>
                <p class="text-xs text-navy/40">预算 ¥{{ currentPlan.budget }}</p>
              </div>
            </div>

            <!-- 天气信息：渐变背景 + 边框 + 更大图标 -->
            <div
              v-if="currentPlan.weather"
              class="relative mt-4 flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-mint/10 to-mint/5 border border-mint/20"
            >
              <span class="text-3xl shrink-0">🌤️</span>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-navy">
                  {{ currentPlan.weather.condition }} · {{ currentPlan.weather.temperature }}
                </p>
                <p class="text-xs text-navy/60 mt-0.5">{{ currentPlan.weather.suggestion }}</p>
              </div>
            </div>
          </BaseCard>

          <!-- 每日行程 -->
          <div v-if="currentPlan.days.length">
            <!-- 日期切换 tab -->
            <div v-if="currentPlan.days.length > 1" class="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
              <button
                v-for="(day, i) in currentPlan.days"
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
              <div class="flex items-center justify-between gap-3 mb-3">
                <h3 class="font-bold text-navy flex items-center gap-2">
                  <span class="w-8 h-8 grid place-items-center rounded-lg bg-coral/15">📍</span>
                  当日路线地图
                </h3>
                <!-- 路线排序切换：按地理（后端重排）/ 按时间（原始顺序） -->
                <div class="inline-flex items-center gap-1 p-1 bg-white rounded-xl shadow-card">
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 outline-none border-none"
                    :class="
                      routeOrder === 'geo'
                        ? 'bg-coral text-white shadow-sm'
                        : 'bg-transparent text-navy/60 hover:text-navy hover:bg-cream-dark/30'
                    "
                    @click="routeOrder = 'geo'"
                  >
                    🗺️ 按地理
                  </button>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 outline-none border-none"
                    :class="
                      routeOrder === 'time'
                        ? 'bg-coral text-white shadow-sm'
                        : 'bg-transparent text-navy/60 hover:text-navy hover:bg-cream-dark/30'
                    "
                    @click="routeOrder = 'time'"
                  >
                    ⏰ 按时间
                  </button>
                </div>
              </div>
              <div class="relative">
                <!-- 跨日距离提示 -->
                <Transition name="cross-day-tip">
                  <div
                    v-if="showCrossDayTip"
                    class="absolute top-2 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none"
                  >
                    <div class="px-4 py-2 rounded-xl bg-white/95 backdrop-blur shadow-lg border border-coral/20 text-sm font-semibold text-navy whitespace-nowrap">
                      📍 距上一日终点 {{ crossDayDistance }} km
                    </div>
                  </div>
                </Transition>
                <AmapMap
                  v-if="mapPoints.length > 0"
                  ref="amapRef"
                  :points="mapPoints"
                  :transport="mapTransport"
                  :height="mapHeight"
                  :city="currentPlan.city"
                  :crossDayPoint="crossDayPoint"
                  @point-click="handlePointClick"
                />
                <div
                  v-else
                  class="bg-white rounded-2xl p-6 shadow-card text-center text-navy/50 text-sm"
                >
                  暂无地图数据
                </div>
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
                <PlanTimeline v-if="currentDay" :day="currentDay" :items="routeItems" />
              </div>
            </BaseCard>
          </div>

          <!-- 出行清单 -->
          <div>
            <h3 class="font-bold text-navy mb-3 flex items-center gap-2">
              <span class="w-8 h-8 grid place-items-center rounded-lg bg-amber/20">📋</span>
              出行准备清单
            </h3>
            <PlanChecklist :checklist="currentPlan.checklist" />
          </div>
        </div>

        <!-- done 但无 plan 数据 -->
        <div v-else class="text-center py-16">
          <div class="text-5xl mb-4">🤔</div>
          <p class="text-navy/50 mb-6">暂未收到行程数据</p>
          <BaseButton @click="handleRetry">重新生成</BaseButton>
        </div>
      </template>
    </div>

    <!-- 分享成功弹窗 -->
    <ShareModal
      :show="shareModalShow"
      :share-url="shareUrl"
      :plan-title="sharePlanTitle"
      :plan-city="sharePlanCity"
      @close="closeShareModal"
    />
  </div>
</template>

<style scoped>
/* 跨日距离提示：淡入淡出 */
.cross-day-tip-enter-active {
  transition: opacity 0.3s ease;
}
.cross-day-tip-enter-from {
  opacity: 0;
}
.cross-day-tip-leave-active {
  transition: opacity 0.3s ease;
}
.cross-day-tip-leave-to {
  opacity: 0;
}

/* 自动保存错误提示：淡入淡出 */
.auto-save-tip-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.auto-save-tip-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.auto-save-tip-leave-active {
  transition: opacity 0.3s ease;
}
.auto-save-tip-leave-to {
  opacity: 0;
}

/* StreamingPanel 淡出：done 后延迟 500ms 隐藏时的过渡动画 */
.streaming-fade-leave-active {
  transition: opacity 0.3s ease;
}
.streaming-fade-leave-to {
  opacity: 0;
}

/* 庆祝 ✓ 徽章：弹入（带回弹）+ 淡出（带缩小） */
.celebrate-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.celebrate-fade-enter-from {
  opacity: 0;
  transform: scale(0);
}
.celebrate-fade-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.celebrate-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* 标题区域闪光扫过（done 后短暂触发） */
.celebrate-sweep {
  animation: celebrate-sweep 1.2s ease-out forwards;
}
@keyframes celebrate-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
