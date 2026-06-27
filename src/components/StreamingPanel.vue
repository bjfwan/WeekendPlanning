<script setup lang="ts">
/**
 * 流式生成展示面板
 * 4 阶段轨道替代假进度条，真实反映 AI 生成进度
 * 阶段：理解需求 → 生成方案 → 优化细节 → 完成
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Sparkles,
  Map,
  ListChecks,
  Check,
  X,
  Clock,
  WifiOff,
  FileQuestion,
  AlertTriangle
} from '@lucide/vue'
import type { Component } from 'vue'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  /** 实际回答内容 */
  content: string
  /** 思考过程内容 */
  reasoning: string
  /** 流式状态：'streaming' 进行中，'done' 已完成，'error' 出错，'cancelled' 已取消 */
  status?: 'streaming' | 'done' | 'error' | 'cancelled'
  /** 坐标补充进度（可选，后端推送 progress 事件时更新） */
  enrichProgress?: { current: number; total: number; location: string } | null
  /** 错误信息 */
  error?: string
  /** 错误类型分类 */
  errorType?: 'network' | 'timeout' | 'empty' | 'parse' | null
}

const props = withDefaults(defineProps<Props>(), {
  status: 'streaming',
  enrichProgress: null,
  error: '',
  errorType: null
})

const emit = defineEmits<{
  cancel: []
  retry: []
  'continue-wait': []
  'modify-pref': []
}>()

// GSAP 入口：context 统一管理动画并在卸载时自动清理
const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()
const ctx = context(() => {})

// 阶段轨道容器引用（用于查找阶段图标元素）
const stageTrackRef = ref<HTMLElement | null>(null)
// 错误状态容器引用
const errorStateRef = ref<HTMLElement | null>(null)
// 轮播提示文字引用
const hintRef = ref<HTMLElement | null>(null)
// 回到底部按钮引用
const scrollBottomBtnRef = ref<HTMLElement | null>(null)
// 超时提示引用
const timeoutPromptRef = ref<HTMLElement | null>(null)
// reasoning 流式光标引用
const reasoningCursorRef = ref<HTMLElement | null>(null)
// content 流式光标引用
const contentCursorRef = ref<HTMLElement | null>(null)
// 阶段切换 timeline 引用（用于清理上一个动画）
let stageTl: ReturnType<typeof gsap.timeline> | null = null
// 错误抖动 tween 引用
let errorShakeTween: ReturnType<typeof gsap.to> | null = null

// ========== 节流工具 ==========
// 限制 fn 在 delay 毫秒内只执行一次（首次触发立即执行，后续在 delay 内被忽略）
// 用于高频 SSE chunk 触发的自动滚动，避免每个 chunk 都写 scrollTop 造成卡顿
function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let lastCall = 0
  return ((...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      lastCall = now
      fn(...args)
    }
  }) as T
}

// ========== 流式内容滚动 ==========
const streamRef = ref<HTMLElement | null>(null)
const isAtBottom = ref(true)
const isReasoningCollapsed = ref(false)
const userToggled = ref(false)
// content（原始 JSON）默认折叠：流式时只显示字数计数，避免评委困惑
const isContentCollapsed = ref(true)

function toggleContent() {
  isContentCollapsed.value = !isContentCollapsed.value
}

// 阶段判断
const isInitializing = computed(
  () => props.reasoning.length === 0 && props.content.length === 0
)
const isThinking = computed(
  () => props.reasoning.length > 0 && props.content.length === 0
)
const isDone = computed(() => props.status === 'done')
const isError = computed(() => props.status === 'error')
const isCancelled = computed(() => props.status === 'cancelled')
const isStreaming = computed(() => props.status === 'streaming')

const reasoningStatus = computed(() => {
  if (isDone.value) return '已完成'
  if (isCancelled.value) return '已取消'
  if (isError.value) return '生成失败'
  if (isThinking.value) return '思考中...'
  if (props.content.length > 0 && isStreaming.value) return '生成中...'
  return '已完成'
})

const reasoningWordCount = computed(() => props.reasoning.length + props.content.length)

function toggleReasoning() {
  isReasoningCollapsed.value = !isReasoningCollapsed.value
  userToggled.value = true
}

// ========== 阶段轨道 ==========
type StageStatus = 'pending' | 'active' | 'done'

interface Stage {
  id: number
  label: string
  icon: Component
  status: StageStatus
}

// 阶段 3 激活启发式：content 长度 > 500 字符（约 50% 进度），或正在补充坐标
const isContentRich = computed(
  () => props.content.length > 500 || !!props.enrichProgress
)

const stages = computed<Stage[]>(() => {
  const hasReasoning = props.reasoning.length > 0
  const hasContent = props.content.length > 0

  // 阶段 1：理解需求 — 接收到请求时激活，stream 开始时完成
  const s1: StageStatus = isDone.value
    ? 'done'
    : hasReasoning || hasContent
      ? 'done'
      : 'active'

  // 阶段 2：生成方案 — 开始收到 stream 时激活，content 富足时完成
  const s2: StageStatus = isDone.value
    ? 'done'
    : !hasReasoning && !hasContent
      ? 'pending'
      : isContentRich.value
        ? 'done'
        : 'active'

  // 阶段 3：优化细节 — content 50% 时激活，stream 结束时完成
  const s3: StageStatus = isDone.value
    ? 'done'
    : !isContentRich.value
      ? 'pending'
      : 'active'

  // 阶段 4：完成 — stream 结束时激活
  const s4: StageStatus = isDone.value ? 'done' : 'pending'

  return [
    { id: 1, label: '理解需求', icon: Sparkles, status: s1 },
    { id: 2, label: '生成方案', icon: Map, status: s2 },
    { id: 3, label: '优化细节', icon: ListChecks, status: s3 },
    { id: 4, label: '完成', icon: Check, status: s4 }
  ]
})

// 当前激活阶段标签（供 aria-label 使用）
const activeStageLabel = computed(() => {
  const active = stages.value.find((s) => s.status === 'active')
  return active ? active.label : isDone.value ? '已完成' : ''
})

// 当前激活阶段 ID（用于 watch 阶段切换动画）
const currentStageId = computed(() => {
  const active = stages.value.find((s) => s.status === 'active')
  return active ? active.id : -1
})

// 连接线状态：current 或 next 任一为 active 则流动
function connectorStatus(index: number): 'pending' | 'active' | 'done' {
  const current = stages.value[index]
  const next = stages.value[index + 1]
  if (current.status === 'active' || next.status === 'active') return 'active'
  if (current.status === 'done' && next.status === 'done') return 'done'
  return 'pending'
}

// ========== 轮播提示 ==========
const carouselHints = [
  '正在分析你的需求...',
  '查询目的地天气...',
  '搜索热门景点...',
  '规划最佳路线...',
  '生成行程方案...'
]
const carouselIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

const currentHint = computed(() => carouselHints[carouselIndex.value])

function startCarousel() {
  if (carouselTimer) return
  carouselTimer = setInterval(() => {
    carouselIndex.value = (carouselIndex.value + 1) % carouselHints.length
  }, 2000)
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

watch(isInitializing, (val) => {
  if (val) startCarousel()
  else stopCarousel()
})

// 新一轮生成开始（content 从有变为空）时重置折叠状态
watch(
  () => props.content,
  (newVal, oldVal) => {
    const isEmpty = !newVal
    if (oldVal && isEmpty) {
      userToggled.value = false
      isReasoningCollapsed.value = false
      isContentCollapsed.value = true
    }
  }
)

// ========== 超时处理 ==========
const TIMEOUT_MS = 30000
const showTimeoutPrompt = ref(false)
let timeoutTimer: ReturnType<typeof setTimeout> | null = null

function resetTimeout() {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  showTimeoutPrompt.value = false
  if (!isStreaming.value) return
  timeoutTimer = setTimeout(() => {
    if (isStreaming.value) {
      showTimeoutPrompt.value = true
    }
  }, TIMEOUT_MS)
}

// 监听 content/reasoning/enrichProgress 变化，重置超时计时
watch(
  [() => props.content, () => props.reasoning, () => props.enrichProgress],
  () => {
    if (isStreaming.value) resetTimeout()
  }
)

// 状态变化时启动/清除超时计时
watch(
  () => props.status,
  (s) => {
    if (s === 'streaming') {
      resetTimeout()
    } else {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      showTimeoutPrompt.value = false
    }
  }
)

function continueWaiting() {
  emit('continue-wait')
  resetTimeout()
}

// ========== 错误状态 ==========
const errorConfig = computed(() => {
  const type = props.errorType
  if (!type) return null
  const configs = {
    network: {
      icon: WifiOff,
      message: '网络连接失败，请检查后重试',
      buttonText: '重试'
    },
    timeout: {
      icon: Clock,
      message: '生成超时，请稍后再试',
      buttonText: '重试'
    },
    empty: {
      icon: FileQuestion,
      message: '未生成有效内容，请补充更多偏好',
      buttonText: '修改偏好'
    },
    parse: {
      icon: AlertTriangle,
      message: '内容解析失败',
      buttonText: '重试'
    }
  }
  return configs[type]
})

function handleErrorAction() {
  if (props.errorType === 'empty') {
    emit('modify-pref')
  } else {
    emit('retry')
  }
}

// ========== 取消 ==========
function handleCancel() {
  if (timeoutTimer) clearTimeout(timeoutTimer)
  showTimeoutPrompt.value = false
  emit('cancel')
}

// ========== 自动滚动 ==========
function doAutoScroll() {
  if (streamRef.value && isAtBottom.value) {
    streamRef.value.scrollTop = streamRef.value.scrollHeight
  }
}

const throttledAutoScroll = throttle(doAutoScroll, 100)

watch([() => props.content, () => props.reasoning], () => {
  nextTick(() => {
    throttledAutoScroll()
  })
})

watch(isReasoningCollapsed, () => {
  nextTick(() => {
    if (!streamRef.value) return
    const { scrollTop, scrollHeight, clientHeight } = streamRef.value
    isAtBottom.value = scrollTop + clientHeight >= scrollHeight - 30
    if (isAtBottom.value) {
      streamRef.value.scrollTop = streamRef.value.scrollHeight
    }
  })
})

// 流式结束时强制滚动到底部（节流可能跳过最后一次 chunk）
watch(
  () => props.status,
  (newVal) => {
    if (newVal !== 'done') return
    nextTick(() => {
      if (streamRef.value && isAtBottom.value) {
        streamRef.value.scrollTo({
          top: streamRef.value.scrollHeight,
          behavior: 'smooth'
        })
      }
    })
  }
)

function handleScroll() {
  if (!streamRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = streamRef.value
  isAtBottom.value = scrollTop + clientHeight >= scrollHeight - 30
}

function scrollToBottom() {
  if (!streamRef.value) return
  streamRef.value.scrollTo({ top: streamRef.value.scrollHeight, behavior: 'smooth' })
  isAtBottom.value = true
}

// ========== GSAP 动画函数 ==========

/**
 * 阶段切换 timeline
 * - watch currentStageId 变化时触发
 * - 旧图标淡出（opacity 1→0.3）
 * - 新图标 scale 弹入（0.8→1, EASE_BACK）
 * - 连接线流动光效（gsap.to 渐变位置）
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playStageTransition(newId: number, oldId: number) {
  if (newId === oldId) return
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const container = stageTrackRef.value
    if (!container) return
    // 清理上一个 timeline
    if (stageTl) {
      stageTl.kill()
      stageTl = null
    }
    // 查找新旧阶段图标元素（桌面端 + 移动端）
    const newEls = container.querySelectorAll<HTMLElement>(`[data-stage-id="${newId}"]`)
    const oldEls = oldId > 0 ? container.querySelectorAll<HTMLElement>(`[data-stage-id="${oldId}"]`) : []
    // 查找新旧阶段之间的连接线
    const connectors = container.querySelectorAll<HTMLElement>('.connector')

    stageTl = gsap.timeline()
    // 旧图标淡出
    if (oldEls.length > 0) {
      stageTl.to(oldEls, { opacity: 0.3, duration: 0.2, ease: EASE_OUT }, 0)
    }
    // 新图标 scale 弹入
    if (newEls.length > 0) {
      stageTl.fromTo(
        newEls,
        { scale: 0.8 },
        { scale: 1, duration: 0.35, ease: EASE_BACK, clearProps: 'transform' },
        0
      )
    }
    // 连接线流动光效：脉冲透明度
    if (connectors.length > 0) {
      stageTl.fromTo(
        connectors,
        { opacity: 0.5 },
        { opacity: 1, duration: 0.3, ease: EASE_OUT, clearProps: 'opacity' },
        0
      )
    }
  })
}

/**
 * 错误抖动动画
 * - gsap.fromTo(el, { x: -8 }, { x: 8, repeat: 3, yoyo: true, duration: 0.08 })
 * - 替代 CSS error-shake keyframe
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playErrorShake() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = errorStateRef.value
    if (!el) return
    // 清理上一个抖动
    if (errorShakeTween) {
      errorShakeTween.kill()
      errorShakeTween = null
    }
    errorShakeTween = gsap.fromTo(
      el,
      { x: -8 },
      {
        x: 8,
        repeat: 3,
        yoyo: true,
        duration: 0.08,
        ease: 'power1.inOut',
        onComplete: () => gsap.set(el, { clearProps: 'transform' })
      }
    )
  })
}

/**
 * 轮播提示切换 timeline
 * - 旧文字 blur + opacity → 新文字 blur + opacity
 * - 替代 hint-fade Transition
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playHintSwitch() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = hintRef.value
    if (!el) return
    gsap.timeline()
      .fromTo(
        el,
        { filter: 'blur(4px)', opacity: 0 },
        { filter: 'blur(0px)', opacity: 1, duration: 0.3, ease: EASE_OUT, clearProps: 'filter,opacity' }
      )
  })
}

/**
 * 流式光标闪烁
 * - gsap.to（opacity 1→0, repeat: -1, yoyo: true, duration: 0.5）
 * - 替代 CSS streaming-blink
 * - 用 context 管理，组件卸载时自动清理
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function startCursorBlink(el: HTMLElement | null) {
  if (!el) return
  ctx.add(() => {
    if (prefersReducedMotion()) return
    gsap.to(el, {
      opacity: 0,
      repeat: -1,
      yoyo: true,
      duration: 0.5,
      ease: 'none'
    })
  })
}

/**
 * 回到底部按钮入场
 * - gsap.from（y: 20, opacity: 0, EASE_OUT）
 * - 替代 scroll-bottom-fade Transition
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playScrollBottomEnter() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = scrollBottomBtnRef.value
    if (!el) return
    gsap.from(el, {
      y: 20,
      opacity: 0,
      duration: 0.25,
      ease: EASE_OUT,
      clearProps: 'transform,opacity'
    })
  })
}

/**
 * 超时提示入场
 * - gsap.from（y: -10, opacity: 0, EASE_BACK）
 * - 替代 timeout-fade Transition
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playTimeoutEnter() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = timeoutPromptRef.value
    if (!el) return
    gsap.from(el, {
      y: -10,
      opacity: 0,
      duration: 0.3,
      ease: EASE_BACK,
      clearProps: 'transform,opacity'
    })
  })
}

// ========== GSAP 动画 watchers ==========

// 阶段切换：watch currentStageId 变化
watch(currentStageId, (newId, oldId) => {
  if (newId === -1) return
  nextTick(() => playStageTransition(newId, oldId))
})

// 错误状态出现：触发抖动
watch(isError, (val) => {
  if (val) {
    nextTick(() => playErrorShake())
  }
})

// 轮播提示切换：watch carouselIndex 变化
watch(carouselIndex, () => {
  nextTick(() => playHintSwitch())
})

// 流式光标：reasoning 光标出现时启动闪烁
watch(
  () => isThinking.value && !isDone.value && props.reasoning.length > 0,
  (show) => {
    if (show) {
      nextTick(() => startCursorBlink(reasoningCursorRef.value))
    }
  }
)

// 流式光标：content 光标出现时启动闪烁
watch(
  () => !isDone.value && props.content.length > 0,
  (show) => {
    if (show) {
      nextTick(() => startCursorBlink(contentCursorRef.value))
    }
  }
)

// 回到底部按钮：出现时入场动画
watch(isAtBottom, (atBottom) => {
  if (!atBottom) {
    nextTick(() => playScrollBottomEnter())
  }
})

// 超时提示：出现时入场动画
watch(showTimeoutPrompt, (show) => {
  if (show) {
    nextTick(() => playTimeoutEnter())
  }
})

// ========== 生命周期 ==========
onMounted(() => {
  if (isInitializing.value) startCarousel()
  if (isStreaming.value) resetTimeout()
})

onUnmounted(() => {
  stopCarousel()
  if (timeoutTimer) clearTimeout(timeoutTimer)
})
</script>

<template>
  <div class="space-y-4">
    <!-- 渐变边框卡片（coral -> amber -> mint） -->
    <div class="relative p-[2px] rounded-3xl bg-gradient-to-br from-coral via-amber to-mint shadow-card">
      <div class="relative rounded-3xl bg-white overflow-hidden">
        <div class="p-5 sm:p-7">
          <!-- ========== 阶段轨道（替代假进度条） ========== -->
          <div
            ref="stageTrackRef"
            class="stage-track"
            aria-live="polite"
            role="status"
            :aria-label="`当前阶段：${activeStageLabel || '等待中'}`"
          >
            <!-- 桌面端：横向排列 -->
            <div class="hidden sm:flex flex-row items-start">
              <template v-for="(stage, i) in stages" :key="stage.id">
                <div class="flex flex-col items-center gap-2">
                  <div :data-stage-id="stage.id" class="stage-icon-wrap" :class="`stage-${stage.status}`">
                    <Check
                      v-if="stage.status === 'done'"
                      :size="18"
                      class="animate-check-pop"
                    />
                    <component :is="stage.icon" v-else :size="18" />
                  </div>
                  <span class="stage-label" :class="`label-${stage.status}`">
                    {{ stage.label }}
                  </span>
                </div>
                <div
                  v-if="i < stages.length - 1"
                  class="connector connector-h flex-1 h-0.5 mt-5 mx-1"
                  :class="`connector-${connectorStatus(i)}`"
                />
              </template>
            </div>

            <!-- 移动端：竖向排列 -->
            <div class="sm:hidden flex flex-col">
              <template v-for="(stage, i) in stages" :key="stage.id">
                <div class="flex flex-row items-center gap-2.5">
                  <div :data-stage-id="stage.id" class="stage-icon-wrap" :class="`stage-${stage.status}`">
                    <Check
                      v-if="stage.status === 'done'"
                      :size="16"
                      class="animate-check-pop"
                    />
                    <component :is="stage.icon" v-else :size="16" />
                  </div>
                  <span class="stage-label" :class="`label-${stage.status}`">
                    {{ stage.label }}
                  </span>
                </div>
                <div
                  v-if="i < stages.length - 1"
                  class="connector connector-v w-0.5 h-4 ml-5"
                  :class="`connector-${connectorStatus(i)}`"
                />
              </template>
            </div>
          </div>

          <!-- ========== 主内容区 ========== -->
          <div class="mt-5">
            <!-- 错误状态 -->
            <div
              v-if="isError && errorConfig"
              ref="errorStateRef"
              class="error-state"
              aria-live="polite"
              role="alert"
            >
              <div class="error-icon-wrap">
                <component :is="errorConfig.icon" :size="28" />
              </div>
              <p class="error-message">{{ errorConfig.message }}</p>
              <button @click="handleErrorAction" class="error-action-btn">
                {{ errorConfig.buttonText }}
              </button>
            </div>

            <!-- 已取消状态 -->
            <div
              v-else-if="isCancelled"
              class="cancelled-state"
              aria-live="polite"
              role="status"
            >
              <div class="cancelled-icon-wrap">
                <X :size="24" />
              </div>
              <p class="cancelled-message">已取消生成</p>
            </div>

            <!-- 流式/完成状态 -->
            <template v-else>
              <!-- 阶段 1：初始化 -->
              <div v-if="isInitializing" class="py-6">
                <div class="flex flex-col items-center gap-4">
                  <!-- 3 个彩色圆点波浪式跳动 -->
                  <div class="flex gap-2.5">
                    <span class="w-3 h-3 rounded-full bg-coral streaming-wave" style="animation-delay: 0ms" />
                    <span class="w-3 h-3 rounded-full bg-amber streaming-wave" style="animation-delay: 200ms" />
                    <span class="w-3 h-3 rounded-full bg-mint streaming-wave" style="animation-delay: 400ms" />
                  </div>
                  <!-- 轮播提示文字（GSAP timeline 切换：blur + opacity） -->
                  <p
                    ref="hintRef"
                    :key="carouselIndex"
                    class="text-sm text-navy/50 h-5"
                  >
                    {{ currentHint }}
                  </p>
                </div>
              </div>

              <!-- 阶段 2 & 3：思考 / 生成 -->
              <div v-else class="space-y-4">
                <!-- 顶部状态 -->
                <div class="flex items-center gap-3">
                  <span class="text-2xl" :class="{ 'streaming-pulse': !isDone }">
                    {{ isDone ? '✅' : (isThinking ? '🧠' : '📝') }}
                  </span>
                  <span class="font-semibold text-navy">
                    {{ isDone ? 'AI 已完成行程规划' : (isThinking ? 'AI 正在思考最佳方案...' : 'AI 正在为你规划行程...') }}
                  </span>
                </div>

                <!-- 流式文本展示区 -->
                <div class="relative">
                  <div
                    ref="streamRef"
                    @scroll="handleScroll"
                    class="max-h-[50vh] overflow-y-auto px-4 pb-4 rounded-xl bg-cream/50 font-mono text-sm whitespace-pre-wrap leading-relaxed"
                  >
                    <!-- 思考过程区域（reasoning + content 均可折叠） -->
                    <div v-if="reasoning || content" class="mb-3">
                      <!-- 折叠头部 -->
                      <div
                        @click="toggleReasoning"
                        class="sticky top-0 z-10 -mx-4 px-4 py-3 flex items-center justify-between gap-2 bg-cream/95 backdrop-blur rounded-t-xl shadow-sm hover:bg-mint/10 cursor-pointer transition-colors duration-200"
                      >
                        <div class="flex items-center gap-2 min-w-0 text-xs">
                          <span class="text-sm">🧠</span>
                          <span class="font-semibold text-navy/70">AI 思考过程</span>
                          <span class="text-navy/30">·</span>
                          <span class="text-navy/50">{{ reasoningStatus }}</span>
                          <span v-if="reasoningWordCount" class="text-navy/30">{{ reasoningWordCount }} 字</span>
                        </div>
                        <svg
                          class="w-3.5 h-3.5 text-navy/50 shrink-0 transition-transform duration-300 ease-in-out"
                          :class="{ '-rotate-90': isReasoningCollapsed }"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <!-- 折叠区域 -->
                      <div v-show="!isReasoningCollapsed" class="pt-2">
                        <!-- reasoning：AI 推理过程 -->
                        <div v-if="reasoning" class="pl-3 border-l-2 border-mint/60 text-navy/40 italic">
                          {{ reasoning }}
                          <span
                            v-if="isThinking && !isDone"
                            ref="reasoningCursorRef"
                            class="inline-block w-2 h-4 bg-mint align-middle ml-0.5"
                          />
                        </div>
                        <!-- content（JSON 行程数据）：默认折叠，仅显示字数计数 -->
                        <div
                          v-if="content"
                          class="pt-2 mt-2 pl-3 border-l-2 border-coral/40 text-navy/50 not-italic"
                        >
                          <!-- 折叠头部：柔和样式，点击展开查看原始数据 -->
                          <div
                            @click="toggleContent"
                            class="flex items-center justify-between gap-2 cursor-pointer hover:text-navy/70 transition-colors duration-200 py-1"
                          >
                            <div class="flex items-center gap-2 text-xs">
                              <span class="text-sm">📝</span>
                              <span class="font-semibold">{{ isDone ? '行程数据' : '正在生成行程数据' }}</span>
                              <span class="opacity-50">·</span>
                              <span class="opacity-70">{{ content.length }} 字</span>
                            </div>
                            <svg
                              class="w-3.5 h-3.5 opacity-50 shrink-0 transition-transform duration-300 ease-in-out"
                              :class="{ '-rotate-90': isContentCollapsed }"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                          <!-- 展开后显示完整原始数据 -->
                          <div v-show="!isContentCollapsed" class="pt-1">
                            <div class="text-[10px] uppercase tracking-wider text-coral/70 font-semibold mb-1">查看原始数据</div>
                            {{ content }}
                            <span
                              v-if="!isDone"
                              ref="contentCursorRef"
                              class="inline-block w-2 h-4 bg-coral align-middle ml-0.5"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 回到底部按钮（GSAP from 入场：y: 20, opacity: 0, EASE_OUT） -->
                  <button
                    v-if="!isAtBottom"
                    ref="scrollBottomBtnRef"
                    @click="scrollToBottom"
                    type="button"
                    aria-label="回到底部"
                    class="absolute bottom-3 right-3 flex items-center gap-1 px-3 py-2 rounded-full bg-coral text-white text-xs font-semibold shadow-lg hover:scale-110 hover:bg-coral/90 active:scale-95 transition-all duration-200"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7-7-7M12 21V3" />
                    </svg>
                    <span>最新</span>
                  </button>
                </div>

                <!-- 坐标补充进度 -->
                <div v-if="enrichProgress" class="mt-3 p-3 rounded-xl bg-coral/10">
                  <div class="flex items-center justify-between text-xs text-navy/70 mb-2">
                    <span>正在补充地图坐标...</span>
                    <span>{{ enrichProgress.current }} / {{ enrichProgress.total }}</span>
                  </div>
                  <div class="h-2 bg-white/50 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-coral rounded-full transition-all duration-300"
                      :style="{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }"
                    />
                  </div>
                  <div class="text-xs text-navy/50 mt-1 truncate">📍 {{ enrichProgress.location }}</div>
                </div>
              </div>
            </template>
          </div>

          <!-- ========== 操作区：取消按钮 / 超时提示 ========== -->
          <div
            v-if="isStreaming"
            class="mt-5 flex justify-center"
            aria-live="polite"
          >
            <!-- 超时提示 / 取消按钮（GSAP from 入场，替代 timeout-fade Transition） -->
            <div v-if="showTimeoutPrompt" ref="timeoutPromptRef" class="timeout-prompt">
              <Clock :size="20" class="shrink-0 text-amber" />
              <p class="text-sm text-navy/70">生成时间较长，是否继续等待？</p>
              <div class="flex gap-2">
                <button @click="continueWaiting" class="timeout-btn-primary">
                  继续等待
                </button>
                <button @click="handleCancel" class="timeout-btn-secondary">
                  取消
                </button>
              </div>
            </div>
            <!-- 取消按钮 -->
            <button
              v-else
              @click="handleCancel"
              class="cancel-btn"
              aria-label="取消生成"
            >
              <X :size="16" />
              <span>取消生成</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 阶段轨道 ========== */
.stage-track {
  padding: 0.5rem 0;
}

.stage-icon-wrap {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  transition: all 250ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* pending: 灰色 */
.stage-pending {
  background: #f3f4f6;
  color: #d1d5db;
  border: 2px solid #e5e7eb;
}

/* active: coral + pulse 动画 */
.stage-active {
  background: #ff6b6b;
  color: white;
  border: 2px solid #ff6b6b;
  animation: stage-activate 250ms cubic-bezier(0.22, 1, 0.36, 1) forwards,
    stage-pulse 1.5s ease-in-out infinite 250ms;
}

/* done: mint */
.stage-done {
  background: #4ecdc4;
  color: white;
  border: 2px solid #4ecdc4;
}

.stage-label {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  transition: color 250ms ease;
}

.label-pending {
  color: #d1d5db;
}
.label-active {
  color: #ff6b6b;
}
.label-done {
  color: #4ecdc4;
}

/* 阶段激活动画：scale 0.8→1 + opacity 0→1 */
@keyframes stage-activate {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* active 阶段 pulse 动画 */
@keyframes stage-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.2);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 107, 107, 0.1);
  }
}

/* check pop 动画（阶段完成） */
@keyframes check-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  60% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ========== 连接线 ========== */
.connector {
  position: relative;
  border-radius: 9999px;
  transition: background 250ms ease;
}

.connector-pending {
  background: #e5e7eb;
}

.connector-done {
  background: #4ecdc4;
}

.connector-active {
  background: linear-gradient(90deg, #4ecdc4, #ff6b6b);
  overflow: hidden;
}

.connector-active::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.6),
    transparent
  );
  animation: connector-flow 1.5s linear infinite;
}

@keyframes connector-flow {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

/* 移动端竖向连接线流动 */
@media (max-width: 639px) {
  .connector-active {
    background: linear-gradient(180deg, #4ecdc4, #ff6b6b);
  }
  .connector-active::after {
    background: linear-gradient(
      180deg,
      transparent,
      rgba(255, 255, 255, 0.6),
      transparent
    );
    animation: connector-flow-v 1.5s linear infinite;
  }
  @keyframes connector-flow-v {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(100%);
    }
  }
}

/* ========== 错误状态 ========== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem 1rem;
  text-align: center;
  /* shake 动画改用 GSAP（playErrorShake） */
}

.error-icon-wrap {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: #fff3c4;
  color: #92400e;
}

.error-message {
  font-size: 0.95rem;
  color: #1a1a2e;
  font-weight: 500;
}

.error-action-btn {
  margin-top: 0.5rem;
  padding: 0.5rem 1.5rem;
  border-radius: 0.75rem;
  background: #ffd93d;
  color: #1a1a2e;
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 200ms ease;
}

.error-action-btn:hover {
  background: #f5c400;
  transform: translateY(-1px);
}

.error-action-btn:active {
  transform: scale(0.97);
}

/* error-shake keyframe 已移除，改用 GSAP fromTo（playErrorShake） */

/* ========== 已取消状态 ========== */
.cancelled-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem 1rem;
  text-align: center;
}

.cancelled-icon-wrap {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: #f3f4f6;
  color: #6b7280;
}

.cancelled-message {
  font-size: 0.95rem;
  color: #6b7280;
  font-weight: 500;
}

/* ========== 取消按钮 ========== */
.cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: 0.75rem;
  background: transparent;
  color: #ff6b6b;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1.5px solid #ff6b6b;
  cursor: pointer;
  transition: all 200ms ease;
}

.cancel-btn:hover {
  background: rgba(255, 107, 107, 0.1);
}

.cancel-btn:active {
  transform: scale(0.97);
}

/* ========== 超时提示 ========== */
.timeout-prompt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: #fff3c4;
  border: 1px solid #ffd93d;
}

.timeout-btn-primary {
  padding: 0.375rem 1rem;
  border-radius: 0.625rem;
  background: #ff6b6b;
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 200ms ease;
}

.timeout-btn-primary:hover {
  background: #e85555;
}

.timeout-btn-primary:active {
  transform: scale(0.97);
}

.timeout-btn-secondary {
  padding: 0.375rem 1rem;
  border-radius: 0.625rem;
  background: white;
  color: #1a1a2e;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  transition: all 200ms ease;
}

.timeout-btn-secondary:hover {
  background: #f9fafb;
}

.timeout-btn-secondary:active {
  transform: scale(0.97);
}

/* ========== 既有动画（保留） ========== */
.streaming-wave {
  animation: streaming-wave 1.2s ease-in-out infinite;
}
@keyframes streaming-wave {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

.streaming-pulse {
  animation: streaming-pulse 1.5s ease-in-out infinite;
}
@keyframes streaming-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.18);
    opacity: 0.75;
  }
}

/* streaming-cursor / streaming-blink 已移除，改用 GSAP to（startCursorBlink） */
/* hint-fade / scroll-bottom-fade / timeout-fade Transition 已移除，改用 GSAP from（playHintSwitch / playScrollBottomEnter / playTimeoutEnter） */

/* ========== 移动端 ========== */
@media (max-width: 640px) {
  .stage-track {
    padding: 0.25rem 0;
  }
  .stage-icon-wrap {
    width: 2.25rem;
    height: 2.25rem;
  }
  .stage-label {
    font-size: 0.6875rem;
  }
}
</style>
