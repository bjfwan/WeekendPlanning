<script setup lang="ts">
/** 行程详情页 - 通过分享码加载并展示已保存的行程 */
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Plan, PlanPreferenceRecord, GeneratePlanRequest, PlanDuration } from '@weekend-planner/shared'
import { fetchPlanByCode, fetchMembers, fetchMyPlans, subscribeMembers } from '@/composables/useShare'
import { useAuth } from '@/composables/useAuth'
import { planRequest } from '@/composables/usePlan'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import ShareModal from '@/components/ShareModal.vue'
import PlanTimeline from '@/components/PlanTimeline.vue'
import PlanChecklist from '@/components/PlanChecklist.vue'
import type { MapPoint } from '@/composables/useAmap'
import type { TransportMode, PlanItem } from '@weekend-planner/shared'
import { isValidChinaCoordinate } from '@weekend-planner/shared/utils'

// AmapMap 异步加载：减小首屏 chunk，地图组件按需载入
const AmapMap = defineAsyncComponent({
  loader: () => import('@/components/AmapMap.vue'),
  loadingComponent: {
    name: 'AmapMapLoading',
    render: () => h('div', { class: 'rounded-2xl bg-cream/60 animate-pulse', style: { minHeight: '300px' } })
  }
})

const route = useRoute()
const router = useRouter()
// 从路由参数获取分享码
const shareCode = route.params.code as string

const { user } = useAuth()

// 行程数据
const plan = ref<Plan | null>(null)
// 行程 id（用于 Realtime 订阅过滤与创建者校验）
const planId = ref('')
// 加载状态
const loading = ref(true)
// 加载错误提示
const loadError = ref('')

// 已加入的成员列表
const members = ref<PlanPreferenceRecord[]>([])
// 当前用户是否为创建者
const isCreator = ref(false)
// Realtime 订阅取消函数
let unsubscribe: (() => void) | null = null

// 当前选中的日期 tab
const activeDay = ref(0)

// 路线排序方式：'time' 按时间顺序，'geo' 按地理顺序（默认按地理，后端已重排）
const routeOrder = ref<'time' | 'geo'>('geo')

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

// 交通方式：优先用生成时保存的 plan.transport，否则默认 mixed
const mapTransport = computed<TransportMode>(() => plan.value?.transport ?? 'mixed')

// 窗口宽度（用于地图高度响应式切换）
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
// 地图高度：桌面端 400px，移动端 300px
const mapHeight = computed(() => (windowWidth.value < 640 ? '300px' : '400px'))

function handleResize() {
  windowWidth.value = window.innerWidth
}

/**
 * 点击地图标记时，滚动到对应的行程卡片
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
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

/**
 * 根据 plan.days 长度推断行程时长
 */
function inferDuration(dayCount: number): PlanDuration {
  if (dayCount >= 3) return '3-day'
  if (dayCount === 2) return '2-day'
  if (dayCount === 1) return '1-day'
  return 'half-day'
}

/**
 * 基于成员偏好重新生成行程
 * 将成员列表转换为 multiUsers，写入共享 planRequest 后跳转到 /plan
 * PlanView 的 onMounted 会读取 planRequest 并调用 generatePlan
 */
function handleRegenerate() {
  if (!plan.value || !members.value.length) return
  // 收集所有成员的偏好去重后作为 preferences
  const allPreferences = Array.from(new Set(members.value.flatMap((m) => m.preferences)))
  const request: GeneratePlanRequest = {
    city: plan.value.city,
    date: plan.value.days[0]?.date ?? '',
    duration: inferDuration(plan.value.days.length),
    budget: plan.value.budget,
    people: members.value.length + 1,
    preferences: allPreferences,
    transport: plan.value.transport ?? 'mixed',
    multiUsers: members.value.map((m) => ({
      nickname: m.nickname,
      preferences: m.preferences
    }))
  }
  planRequest.value = request
  router.push({ name: 'plan' })
}

// 页面挂载时加载行程
onMounted(async () => {
  window.addEventListener('resize', handleResize)
  try {
    const data = await fetchPlanByCode(shareCode)
    plan.value = data.plan
    planId.value = data.planId

    // 拉取已加入成员列表
    members.value = await fetchMembers(shareCode)

    // 判断当前用户是否为创建者：检查 plan 是否在用户的历史行程中
    const userId = user.value?.id
    if (userId) {
      try {
        const myPlans = await fetchMyPlans(userId)
        isCreator.value = myPlans.some((p) => p.id === planId.value)
      } catch {
        isCreator.value = false
      }
    }

    // 订阅 plan_preferences 表的实时新增（按 plan_id 过滤）
    unsubscribe = subscribeMembers(shareCode, planId.value, (member) => {
      // 避免重复添加同一成员
      if (members.value.some((m) => m.id === member.id)) return
      members.value.push(member)
    })
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '行程不存在或分享码无效'
  } finally {
    loading.value = false
  }
})

// 离开页面时清理事件监听
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
})
</script>

<template>
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

      <!-- 已加入的伙伴 -->
      <BaseCard v-if="members.length" padding="md">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-navy flex items-center gap-2">
            <span class="w-8 h-8 grid place-items-center rounded-lg bg-coral/15">👥</span>
            已加入的伙伴（{{ members.length }}）
          </h3>
        </div>
        <div class="space-y-2">
          <div
            v-for="m in members"
            :key="m.id"
            class="flex items-center gap-3 p-3 rounded-xl bg-cream/50"
          >
            <span class="w-10 h-10 grid place-items-center rounded-full bg-coral text-white text-sm font-bold shrink-0">
              {{ m.nickname.charAt(0).toUpperCase() }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-navy truncate">{{ m.nickname }}</p>
              <div v-if="m.preferences.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="p in m.preferences"
                  :key="p"
                  class="text-xs px-2 py-0.5 rounded-full bg-navy/5 text-navy/60"
                >
                  {{ p }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <!-- 基于成员偏好重新生成行程（仅创建者且成员数>0） -->
        <div v-if="isCreator && members.length > 0" class="mt-4 pt-4 border-t border-navy/5">
          <BaseButton variant="secondary" class="w-full" @click="handleRegenerate">
            🔄 基于成员偏好重新生成行程
          </BaseButton>
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
            <AmapMap
              v-if="mapPoints.length > 0"
              :points="mapPoints"
              :transport="mapTransport"
              :height="mapHeight"
              :city="plan.city"
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
        <PlanChecklist :checklist="plan.checklist" />
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
