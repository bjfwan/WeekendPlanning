<script setup lang="ts">
/** 行程结果页 - 接收表单数据，流式生成并展示行程 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, defineAsyncComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import { usePlan, planRequest } from '@/composables/usePlan'
import { useAuth } from '@/composables/useAuth'
import { savePlan } from '@/composables/useShare'
import { useGsap } from '@/composables/useGsap'
import { useGsapNumber } from '@/composables/useGsapNumber'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import ShareModal from '@/components/ShareModal.vue'
import PlanTimeline from '@/components/PlanTimeline.vue'
import PlanChecklist from '@/components/PlanChecklist.vue'
import StreamingPanel from '@/components/StreamingPanel.vue'
import type { MapPoint } from '@/composables/useAmap'
import type { TransportMode, PlanItem, Plan } from '@weekend-planner/shared'
import { isValidChinaCoordinate } from '@weekend-planner/shared/utils'

// AmapMap 异步加载：减小首屏 chunk，地图组件按需载入
const AmapMap = defineAsyncComponent({
  loader: () => import('@/components/AmapMap.vue'),
  loadingComponent: {
    name: 'AmapMapLoading',
    render: () => h('div', { class: 'rounded-2xl bg-cream/60 animate-pulse', style: { minHeight: '300px' } })
  }
})

const router = useRouter()
const { content, reasoning, plan, status, error, enrichProgress, generatePlan, retry, cancel } = usePlan()
const { user, ensureSession } = useAuth()
const { gsap, matchMedia, context, EASE_OUT, EASE_IN_OUT, EASE_BACK } = useGsap()

// 当前选中的日期 tab
const activeDay = ref(0)

// 路线排序方式：'time' 按时间顺序，'geo' 按地理顺序（默认按地理，后端已重排）
const routeOrder = ref<'time' | 'geo'>('geo')

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

// StreamingPanel 延迟隐藏：done 后保留 500ms 让内部 watch(status) 触发强制滚动，
// 之后自动隐藏以展示行程结果；新一轮生成时重置为 true
const showStreamingPanel = ref(true)
let streamingPanelHideTimer: ReturnType<typeof setTimeout> | null = null

// 演示兜底行程：AI 生成失败时供评委体验完整效果（杭州一日游，真实坐标）
const demoPlanLoaded = ref(false)

const demoPlan: Plan = {
  id: 'demo-hangzhou-1day',
  city: '杭州',
  title: '杭州西湖一日漫游 · 山水人文之旅',
  summary: '从灵隐禅踪到西湖烟波，再到河坊街市井烟火，一天玩转杭州经典。',
  days: [
    {
      day: 1,
      date: '2026-06-27',
      totalCost: 250,
      items: [
        {
          id: 'demo-1',
          time: '08:30',
          endTime: '10:30',
          title: '灵隐寺',
          location: '灵隐寺',
          address: '杭州市西湖区灵隐路法云弄1号',
          description: '千年古刹，杭州最早佛教寺院。飞来峰石窟造像与古木参天，晨间清幽宜静心游览。',
          cost: 75,
          duration: '2小时',
          transport: '公交',
          tips: '飞来峰门票45元已含，进灵隐寺另购香花券30元',
          locationLng: 120.1014,
          locationLat: 30.2418
        },
        {
          id: 'demo-2',
          time: '11:00',
          endTime: '12:30',
          title: '西湖·断桥残雪',
          location: '断桥',
          address: '杭州市西湖区北山街',
          description: '白蛇传传说之地，沿白堤漫步可赏西湖全景，远眺保俶塔。',
          cost: 0,
          duration: '1.5小时',
          transport: '步行',
          tips: '免费开放，建议沿白堤走到平湖秋月',
          locationLng: 120.1624,
          locationLat: 30.2647
        },
        {
          id: 'demo-3',
          time: '13:00',
          endTime: '14:30',
          title: '三潭印月（西湖游船）',
          location: '三潭印月',
          address: '杭州市西湖区西湖中央',
          description: '西湖十景之一，乘船上岛可观水中三塔，1元人民币背面图案取景地。',
          cost: 55,
          duration: '1.5小时',
          transport: '游船',
          tips: '船票含上岛门票，往返约1.5小时',
          locationLng: 120.145,
          locationLat: 30.24
        },
        {
          id: 'demo-4',
          time: '15:00',
          endTime: '16:30',
          title: '雷峰塔',
          location: '雷峰塔',
          address: '杭州市西湖区南山路15号',
          description: '登塔俯瞰西湖全景，白蛇传镇压传说发源地，夕照时分最佳。',
          cost: 40,
          duration: '1.5小时',
          transport: '步行',
          tips: '电梯可登塔，傍晚雷峰夕照为西湖十景之一',
          locationLng: 120.149,
          locationLat: 30.233
        },
        {
          id: 'demo-5',
          time: '17:30',
          endTime: '20:00',
          title: '河坊街',
          location: '河坊街',
          address: '杭州市上城区河坊街',
          description: '杭州古街区，汇聚定胜糕、葱包桧、龙井虾仁等地道小吃与老字号，夜市烟火气十足。',
          cost: 80,
          duration: '2.5小时',
          transport: '公交',
          tips: '胡庆余堂、方回春堂等老字号可逛，晚餐推荐知味观',
          locationLng: 120.169,
          locationLat: 30.253
        }
      ]
    }
  ],
  totalCost: 250,
  budget: 300,
  checklist: {
    items: [
      '身份证（部分景点购票需要）',
      '舒适步行鞋（全天步行约1.5万步）',
      '防晒霜与遮阳帽（夏季西湖日照强）',
      '充电宝（拍照耗电快）',
      '雨伞（杭州夏季多阵雨）',
      '水杯（景区直饮水点可补水）'
    ],
    reminders: [
      '灵隐寺早8点开门，建议第一批入园避开人流',
      '西湖游船末班约16:30，注意安排时间',
      '河坊街夜市18点后最热闹',
      '杭州公交支持支付宝乘车码',
      '周末西湖景区限行，建议公共交通出行'
    ],
    mapLinks: [
      'https://uri.amap.com/marker?position=120.1014,30.2418&name=灵隐寺',
      'https://uri.amap.com/marker?position=120.1624,30.2647&name=断桥',
      'https://uri.amap.com/marker?position=120.149,30.233&name=雷峰塔',
      'https://uri.amap.com/marker?position=120.169,30.253&name=河坊街'
    ]
  },
  weather: {
    condition: '晴转多云',
    temperature: '26°C ~ 32°C',
    suggestion: '夏日炎热，注意防晒补水；午后可能有阵雨，建议携带雨具。早晚游西湖较为舒适。'
  },
  transport: 'mixed'
}

// 是否有有效的表单数据
const hasRequest = computed(() => planRequest.value !== null)

// 当前行程数据
const currentPlan = computed(() => plan.value)

// StreamingPanel 的 status：映射 usePlan 的 status + cancelled 状态
// 'cancelled' 优先；'done'/'error' 直通；其余回退为 'streaming'
const panelStatus = computed<'streaming' | 'done' | 'error' | 'cancelled'>(() => {
  if (cancelled.value) return 'cancelled'
  if (status.value === 'done') return 'done'
  if (status.value === 'error') return 'error'
  return 'streaming'
})

// 错误类型分类：根据错误消息关键词推断，或 done 但无 plan 时为 'empty'
const errorType = computed<'network' | 'timeout' | 'empty' | 'parse' | null>(() => {
  if (cancelled.value) return null
  if (status.value === 'done' && !plan.value) return 'empty'
  if (status.value !== 'error') return null
  const msg = (error.value || '').toLowerCase()
  if (
    msg.includes('超时') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('断开')
  ) {
    return 'timeout'
  }
  if (msg.includes('解析') || msg.includes('parse') || msg.includes('json')) {
    return 'parse'
  }
  return 'network'
})

// 用户从 StreamingPanel 取消后的状态：1.5s 后隐藏面板
const cancelled = ref(false)
let cancelledTimer: ReturnType<typeof setTimeout> | null = null

// 当前展示的日期行程
const currentDay = computed(() => {
  if (!currentPlan.value || !currentPlan.value.days.length) return null
  return currentPlan.value.days[activeDay.value] ?? currentPlan.value.days[0]
})

// 时间轴容器引用（用于点击地图标记时定位卡片）
const timelineRef = ref<HTMLDivElement | null>(null)

// GSAP 动画元素引用
// 行程头部卡片容器（用于入场动画）
const headerCardRef = ref<HTMLDivElement | null>(null)
// 地图区域（用于入场）
const mapSectionRef = ref<HTMLDivElement | null>(null)
// 日期 tab 容器（用于入场 + 滑动指示条定位）
const dayTabsRef = ref<HTMLDivElement | null>(null)
// 日期 tab 滑动指示条（gsap 控制位置 + 宽度）
const dayIndicatorRef = ref<HTMLDivElement | null>(null)
// 时间轴卡片容器（用于入场）
const timelineCardRef = ref<HTMLDivElement | null>(null)
// 清单容器（用于入场）
const checklistRef = ref<HTMLDivElement | null>(null)
// 路线排序容器（用于滑块定位）
const routeOrderRef = ref<HTMLDivElement | null>(null)
// 路线排序滑块（gsap 控制位置）
const routeOrderSliderRef = ref<HTMLDivElement | null>(null)

// 总花费数字滚动（done 后从 0 滚动到 totalCost）
const animatedTotalCost = useGsapNumber(() => currentPlan.value?.totalCost ?? 0, {
  duration: 1.2,
  ease: EASE_OUT
})

// 当前高亮卡片的 gsap timeline（用于清理）
let highlightTimeline: gsap.core.Timeline | null = null

// 创建 gsap context 包装所有动画（onBeforeUnmount 自动 revert 清理）
context(() => {
  // context scope：所有在此处及通过 matchMedia 创建的动画会被自动清理
})

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

/**
 * 点击地图标记时，滚动到对应的行程卡片并高亮 2 秒（gsap timeline 编排）
 * - scrollIntoView 平滑滚动
 * - ring 弹性出现（boxShadow + scale，EASE_BACK）
 * - 2s 后淡出恢复
 */
function handlePointClick(mapIndex: number) {
  const itemIndex = mapPointItemIndices.value[mapIndex]
  if (itemIndex == null) return
  const container = timelineRef.value
  if (!container) return
  const wrappers = container.querySelectorAll<HTMLElement>('.relative.pl-8')
  const wrapper = wrappers[itemIndex]
  if (!wrapper) return
  const card = wrapper.querySelector<HTMLElement>('.bg-white.rounded-2xl.p-5')
  if (!card) return

  if (highlightTimeline) {
    highlightTimeline.kill()
    highlightTimeline = null
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'center' })

  matchMedia((ctx, isReduce) => {
    if (isReduce) {
      gsap.set(card, {
        boxShadow: '0 0 0 4px #FF6B6B, 0 8px 20px rgba(255, 107, 107, 0.3)',
        scale: 1
      })
      return
    }
    highlightTimeline = gsap.timeline({
      onComplete: () => {
        highlightTimeline = null
      }
    })
    highlightTimeline.fromTo(
      card,
      {
        boxShadow: '0 0 0 0px rgba(255, 107, 107, 0), 0 0 0 rgba(255, 107, 107, 0)',
        scale: 1
      },
      {
        boxShadow: '0 0 0 4px #FF6B6B, 0 8px 20px rgba(255, 107, 107, 0.3)',
        scale: 1.03,
        duration: 0.4,
        ease: EASE_BACK
      }
    )
    highlightTimeline.to(card, {
      boxShadow: '0 0 0 0px rgba(255, 107, 107, 0), 0 0 0 rgba(255, 107, 107, 0)',
      scale: 1,
      duration: 0.4,
      ease: EASE_OUT,
      delay: 1.6
    })
  })
}

/**
 * 行程结果入场 timeline（status === 'done' 后触发）
 * 编排头部卡片、地图、日期 tab、时间轴、清单的依次入场
 */
function playEntranceTimeline() {
  matchMedia((ctx, isReduce) => {
    const header = headerCardRef.value
    const mapSection = mapSectionRef.value
    const dayTabs = dayTabsRef.value
    const timelineCard = timelineCardRef.value
    const checklist = checklistRef.value

    if (isReduce) {
      gsap.set([header, mapSection, dayTabs, timelineCard, checklist], {
        opacity: 1,
        y: 0,
        scale: 1
      })
      return
    }

    const tl = gsap.timeline()
    if (header) {
      tl.from(header, { y: 30, opacity: 0, scale: 0.96, duration: 0.6, ease: EASE_BACK })
    }
    if (mapSection) {
      tl.from(mapSection, { y: 20, opacity: 0, duration: 0.5, ease: EASE_OUT }, 0.15)
    }
    if (dayTabs) {
      const tabs = dayTabs.querySelectorAll('button')
      tl.from(tabs, { y: 15, opacity: 0, duration: 0.4, ease: EASE_OUT, stagger: 0.05 }, 0.3)
    }
    if (timelineCard) {
      tl.from(timelineCard, { y: 20, opacity: 0, duration: 0.5, ease: EASE_OUT }, 0.4)
    }
    if (checklist) {
      tl.from(checklist, { y: 20, opacity: 0, duration: 0.5, ease: EASE_OUT }, 0.5)
    }
  })
}

/**
 * 更新日期 tab 滑动指示条位置（watch activeDay + resize 时调用）
 * 类似 iOS tab 切换效果：gsap.to 移动 x 位置 + 宽度
 */
function updateDayIndicator() {
  const container = dayTabsRef.value
  const indicator = dayIndicatorRef.value
  if (!container || !indicator) return
  const buttons = container.querySelectorAll<HTMLButtonElement>('button')
  const activeBtn = buttons[activeDay.value]
  if (!activeBtn) return
  const containerRect = container.getBoundingClientRect()
  const btnRect = activeBtn.getBoundingClientRect()
  const x = btnRect.left - containerRect.left
  const width = btnRect.width
  const height = btnRect.height
  const y = btnRect.top - containerRect.top
  matchMedia((ctx, isReduce) => {
    if (isReduce) {
      gsap.set(indicator, { x, y, width, height, opacity: 1 })
      return
    }
    gsap.to(indicator, { x, y, width, height, opacity: 1, duration: 0.3, ease: EASE_IN_OUT })
  })
}

/**
 * 更新路线排序滑块位置（watch routeOrder + resize 时调用）
 * gsap.to 移动 x 位置
 */
function updateRouteOrderSlider() {
  const container = routeOrderRef.value
  const slider = routeOrderSliderRef.value
  if (!container || !slider) return
  const buttons = container.querySelectorAll<HTMLButtonElement>('button')
  const activeBtn = routeOrder.value === 'geo' ? buttons[0] : buttons[1]
  if (!activeBtn) return
  const containerRect = container.getBoundingClientRect()
  const btnRect = activeBtn.getBoundingClientRect()
  const x = btnRect.left - containerRect.left
  const width = btnRect.width
  const y = btnRect.top - containerRect.top
  const height = btnRect.height
  matchMedia((ctx, isReduce) => {
    if (isReduce) {
      gsap.set(slider, { x, y, width, height, opacity: 1 })
      return
    }
    gsap.to(slider, { x, y, width, height, opacity: 1, duration: 0.25, ease: EASE_IN_OUT })
  })
}
// 监听生成状态：done 时保存 transport 到 plan、自动保存到 Supabase
watch(status, async (newStatus) => {
  if (newStatus === 'done') {
    // 保存用户选择的交通方式到 plan，供 PlanDetailView 恢复使用
    if (plan.value && planRequest.value?.transport) {
      plan.value = { ...plan.value, transport: planRequest.value.transport }
    }

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

    // 触发行程结果入场 timeline（等待 DOM 渲染完成）
    await nextTick()
    playEntranceTimeline()
    // 初始化日期 tab 指示条与路线排序滑块位置
    updateDayIndicator()
    updateRouteOrderSlider()
  } else {
    // 新一轮生成或重置：重新显示 StreamingPanel，并清除待执行的隐藏定时器
    // 避免上一轮 done 的 setTimeout 在 streaming 期间误触发隐藏
    if (streamingPanelHideTimer) {
      clearTimeout(streamingPanelHideTimer)
      streamingPanelHideTimer = null
    }
    showStreamingPanel.value = true
    // 新一轮生成时重置 cancelled 状态，让 StreamingPanel 重新可用
    cancelled.value = false
    if (cancelledTimer) {
      clearTimeout(cancelledTimer)
      cancelledTimer = null
    }
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

// 监听日期 tab 切换：移动滑动指示条
watch(activeDay, () => {
  nextTick(() => {
    updateDayIndicator()
  })
})

// 监听路线排序切换：移动滑块
watch(routeOrder, () => {
  nextTick(() => {
    updateRouteOrderSlider()
  })
})

// 重新生成
function handleRetry() {
  if (!planRequest.value) return
  activeDay.value = 0
  demoPlanLoaded.value = false
  retry(planRequest.value)
}

// 加载演示兜底行程：AI 生成失败时供评委体验完整效果
async function loadDemoPlan() {
  plan.value = demoPlan
  demoPlanLoaded.value = true
  activeDay.value = 0
  // 隐藏流式面板，展示行程结果
  showStreamingPanel.value = false
  // 等待 DOM 渲染后触入场动画与指示条定位
  await nextTick()
  playEntranceTimeline()
  updateDayIndicator()
  updateRouteOrderSlider()
}

// 返回首页修改
function goHome() {
  cancel()
  router.push({ name: 'home' })
}

/**
 * StreamingPanel 取消事件：调用 usePlan 取消请求，标记 cancelled 状态，
 * 1.5s 后隐藏面板（让用户看到"已取消"反馈）
 */
function handleCancelFromPanel() {
  cancel()
  cancelled.value = true
  if (cancelledTimer) clearTimeout(cancelledTimer)
  cancelledTimer = setTimeout(() => {
    showStreamingPanel.value = false
  }, 1500)
}

/**
 * StreamingPanel 继续等待事件：当前超时提示由 StreamingPanel 内部管理，
 * 此处仅作为 emit 兼容入口，无需额外处理
 */
function handleContinueWait() {
  // no-op：超时计时由 StreamingPanel 内部重置
}

/**
 * StreamingPanel 修改偏好事件：导航回首页让用户调整表单
 */
function handleModifyPref() {
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
  if (autoSaveErrorTimer) clearTimeout(autoSaveErrorTimer)
  if (streamingPanelHideTimer) clearTimeout(streamingPanelHideTimer)
  if (cancelledTimer) clearTimeout(cancelledTimer)
  // 清理 gsap timeline
  if (highlightTimeline) {
    highlightTimeline.kill()
    highlightTimeline = null
  }
})
</script>

<template>
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
            v-if="status === 'done' || status === 'error' || cancelled"
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

      <!-- 流式生成中：v-if 条件包含 'done'/'error'/'cancelled'，让 StreamingPanel 统一接管状态展示 -->
      <!-- done 后通过 showStreamingPanel 延迟 500ms 隐藏，过渡淡出展示行程结果 -->
      <Transition name="streaming-fade">
        <StreamingPanel
          v-if="showStreamingPanel && (status === 'streaming' || status === 'done' || status === 'error' || cancelled)"
          :content="content"
          :reasoning="reasoning"
          :status="panelStatus"
          :enrich-progress="enrichProgress"
          :error="error"
          :error-type="errorType"
          @cancel="handleCancelFromPanel"
          @retry="handleRetry"
          @continue-wait="handleContinueWait"
          @modify-pref="handleModifyPref"
        />
      </Transition>

      <!-- 生成失败时的兜底入口：加载演示行程，供评委体验完整效果 -->
      <div v-if="status === 'error' && !demoPlanLoaded" class="mt-2 text-center">
        <p class="text-navy/40 text-sm mb-3">或先体验演示行程效果</p>
        <BaseButton variant="secondary" @click="loadDemoPlan">🎯 加载演示行程</BaseButton>
      </div>

      <!-- 行程展示 -->
      <div v-if="(status === 'done' || demoPlanLoaded) && currentPlan" class="space-y-6">
        <!-- 行程头部（包裹 div 用于 gsap 入场动画） -->
        <div ref="headerCardRef">
          <BaseCard padding="lg" class="relative overflow-hidden sm:rounded-3xl">
          <!-- 装饰渐变背景 -->
          <div class="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full bg-coral/10 blur-3xl" />
          <div class="pointer-events-none absolute -bottom-20 -left-16 w-48 h-48 rounded-full bg-mint/10 blur-3xl" />

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
        </div>

        <!-- 每日行程 -->
        <div v-if="currentPlan.days.length">
          <!-- 日期切换 tab -->
          <div
            ref="dayTabsRef"
            v-if="currentPlan.days.length > 1"
            class="relative flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1"
          >
            <!-- 滑动指示条：gsap 控制位置/宽度/高度，opacity 由 updateDayIndicator 初始化为 1 -->
            <div
              ref="dayIndicatorRef"
              class="absolute top-0 left-0 z-0 rounded-xl bg-coral opacity-0 pointer-events-none"
              aria-hidden="true"
            ></div>
            <button
              v-for="(day, i) in currentPlan.days"
              :key="i"
              @click="switchDay(i)"
              :class="[
                'relative z-10 shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 outline-none',
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
          <div ref="mapSectionRef" v-if="currentDay" class="mb-4">
            <div class="flex items-center justify-between gap-3 mb-3">
              <h3 class="font-bold text-navy flex items-center gap-2">
                <span class="w-8 h-8 grid place-items-center rounded-lg bg-coral/15">📍</span>
                当日路线地图
              </h3>
              <!-- 路线排序切换：按地理（后端重排）/ 按时间（原始顺序） -->
              <div ref="routeOrderRef" class="relative inline-flex items-center gap-1 p-1 bg-white rounded-xl shadow-card">
                <!-- 滑块：gsap 控制位置/宽度/高度，opacity 由 updateRouteOrderSlider 初始化为 1 -->
                <div
                  ref="routeOrderSliderRef"
                  class="absolute top-0 left-0 z-0 rounded-lg bg-coral opacity-0 pointer-events-none"
                  aria-hidden="true"
                ></div>
                <button
                  type="button"
                  class="relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 outline-none border-none"
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
                  class="relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 outline-none border-none"
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
                :city="currentPlan.city"
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
          <div ref="timelineCardRef">
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
        </div>

        <!-- 出行清单 -->
        <div ref="checklistRef">
          <h3 class="font-bold text-navy mb-3 flex items-center gap-2">
            <span class="w-8 h-8 grid place-items-center rounded-lg bg-amber/20">📋</span>
            出行准备清单
          </h3>
          <PlanChecklist :checklist="currentPlan.checklist" />
        </div>
      </div>

      <!-- done 但无 plan 数据 -->
      <div v-else-if="status === 'done' && !currentPlan" class="text-center py-16">
        <div class="text-5xl mb-4">🤔</div>
        <p class="text-navy/50 mb-6">暂未收到行程数据</p>
        <div class="flex flex-col items-center gap-3">
          <BaseButton @click="handleRetry">重新生成</BaseButton>
          <BaseButton variant="secondary" @click="loadDemoPlan">🎯 加载演示行程</BaseButton>
        </div>
      </div>
    </template>

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
</style>
