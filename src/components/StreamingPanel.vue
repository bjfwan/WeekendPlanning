<script setup lang="ts">
/**
 * 流式生成展示面板
 * 分阶段展示 AI 思考与生成过程：
 *  - 阶段 1（初始化）：reasoning 与 content 均为空，展示跳动圆点 + 旋转光环 + 轮播提示
 *  - 阶段 2（思考中）：有 reasoning、无 content，展示思考内容 + mint 竖线 + 打字机光标
 *  - 阶段 3（生成中）：有 content，展示实际内容 + coral 竖线 + 打字机光标
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

interface Props {
  /** 实际回答内容 */
  content: string
  /** 思考过程内容 */
  reasoning: string
  /** 流式状态：'streaming' 进行中，'done' 已完成（流式结束时会强制滚动一次到底部） */
  status?: 'streaming' | 'done'
  /** 坐标补充进度（可选，后端推送 progress 事件时更新） */
  enrichProgress?: { current: number; total: number; location: string } | null
}

const props = withDefaults(defineProps<Props>(), {
  status: 'streaming',
  enrichProgress: null
})

// 节流函数：限制 fn 在 delay 毫秒内只执行一次（首次触发立即执行，后续在 delay 内被忽略）
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

// 流式内容容器引用，用于自动滚动到底部
const streamRef = ref<HTMLElement | null>(null)

// 用户是否处于底部：只有处于底部时才自动跟随滚动
const isAtBottom = ref(true)

// 思考过程折叠状态：true=收起，false=展开
// 同时控制 reasoning 与 content（JSON 行程数据）的折叠/展开
const isReasoningCollapsed = ref(false)
// 用户是否手动操作过折叠头部（一旦手动操作，本轮不再自动改变状态）
const userToggled = ref(false)

// 阶段判断
// 阶段 1：初始化（reasoning 和 content 都为空）
const isInitializing = computed(
  () => props.reasoning.length === 0 && props.content.length === 0
)
// 阶段 2：思考中（有 reasoning，无 content）
const isThinking = computed(
  () => props.reasoning.length > 0 && props.content.length === 0
)
// 是否已完成：status === 'done' 时，隐藏思考中提示，显示"已完成"状态
const isDone = computed(() => props.status === 'done')

// 思考状态指示文本（含生成阶段，因为 content 也归入思考区域）
const reasoningStatus = computed(() => {
  if (isDone.value) return '已完成'
  if (isThinking.value) return '思考中...'
  if (props.content.length > 0 && props.status === 'streaming') return '生成中...'
  return '已完成'
})

// 思考区域字数统计（reasoning + content 均属于思考区域）
const reasoningWordCount = computed(() => props.reasoning.length + props.content.length)

// 用户手动切换折叠状态
function toggleReasoning() {
  isReasoningCollapsed.value = !isReasoningCollapsed.value
  userToggled.value = true
}

// 阶段 1 轮播提示文字，每 2 秒切换一次
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

// 启动轮播
function startCarousel() {
  if (carouselTimer) return
  carouselTimer = setInterval(() => {
    carouselIndex.value = (carouselIndex.value + 1) % carouselHints.length
  }, 2000)
}

// 停止轮播
function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

// 仅在初始化阶段轮播，进入思考/生成阶段后停止
watch(isInitializing, (val) => {
  if (val) startCarousel()
  else stopCarousel()
})

// 监听 content 变化：新一轮生成开始（content 从有变为空）时重置折叠状态
// content 与 reasoning 同属折叠区域，新一轮开始时默认展开
watch(
  () => props.content,
  (newVal, oldVal) => {
    const isEmpty = !newVal
    if (oldVal && isEmpty) {
      // 新一轮生成开始，重置状态
      userToggled.value = false
      isReasoningCollapsed.value = false
    }
  }
)

onMounted(() => {
  if (isInitializing.value) startCarousel()
})
onUnmounted(() => stopCarousel())

// 实际执行自动滚动到底部的逻辑：仅当用户处于底部时才跟随
function doAutoScroll() {
  if (streamRef.value && isAtBottom.value) {
    streamRef.value.scrollTop = streamRef.value.scrollHeight
  }
}

// 节流后的自动滚动：100ms 内最多触发一次，避免高频 SSE chunk 造成卡顿
const throttledAutoScroll = throttle(doAutoScroll, 100)

// 自动滚动流式内容到底部：仅当用户处于底部时才跟随（节流 100ms）
// 注意：节流后最后一次 chunk 可能被跳过，由下方 status 变化的 watch 兜底
watch([() => props.content, () => props.reasoning], () => {
  nextTick(() => {
    throttledAutoScroll()
  })
})

// 折叠/展开状态变化时，重新计算 isAtBottom 并必要时滚动到底部
// 使用 v-show 切换（display: none/block），DOM 立即更新，无过渡动画
watch(isReasoningCollapsed, () => {
  nextTick(() => {
    if (!streamRef.value) return
    const { scrollTop, scrollHeight, clientHeight } = streamRef.value
    isAtBottom.value = scrollTop + clientHeight >= scrollHeight - 30
    // 折叠后用户仍在底部：保持滚动到底部，避免视觉跳变
    // 折叠后用户不在底部：不强制滚动，尊重用户的滚动位置
    if (isAtBottom.value) {
      streamRef.value.scrollTop = streamRef.value.scrollHeight
    }
  })
})

// 任务 3：流式结束时强制滚动到底部
// 节流可能导致最后一次 chunk 的滚动被跳过，流式结束（status -> 'done'）时
// 若用户仍在底部，强制平滑滚动一次，确保最后一行可见
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

// 监听滚动事件，判断用户是否处于底部
// 阈值 30px，允许小幅误差
function handleScroll() {
  if (!streamRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = streamRef.value
  isAtBottom.value = scrollTop + clientHeight >= scrollHeight - 30
}

// 一键平滑滚动到底部并恢复自动跟随
function scrollToBottom() {
  if (!streamRef.value) return
  streamRef.value.scrollTo({ top: streamRef.value.scrollHeight, behavior: 'smooth' })
  isAtBottom.value = true
}
</script>

<template>
  <div class="space-y-4">
    <!-- 渐变边框卡片（coral -> amber -> mint） -->
    <div class="relative p-[2px] rounded-3xl bg-gradient-to-br from-coral via-amber to-mint shadow-card">
      <div class="relative rounded-3xl bg-white overflow-hidden">
        <!-- 顶部循环进度条（不确定进度，循环表示"进行中"） -->
        <!-- done 时改为满宽 mint 实色条，表示已完成 -->
        <div class="h-1 w-full bg-navy/5 overflow-hidden">
          <div
            v-if="!isDone"
            class="streaming-progress h-full bg-gradient-to-r from-coral via-amber to-mint"
          />
          <div v-else class="h-full w-full bg-mint" />
        </div>

        <div class="p-6 sm:p-8">
          <!-- 阶段 1：初始化 -->
          <div v-if="isInitializing" class="relative py-10">
            <!-- 旋转渐变光环背景 -->
            <div class="absolute inset-0 grid place-items-center pointer-events-none">
              <div class="streaming-halo w-56 h-56 rounded-full opacity-25" />
            </div>
            <div class="relative flex flex-col items-center gap-6">
              <!-- 3 个彩色圆点波浪式跳动 -->
              <div class="flex gap-2.5">
                <span class="w-3.5 h-3.5 rounded-full bg-coral streaming-wave" style="animation-delay: 0ms" />
                <span class="w-3.5 h-3.5 rounded-full bg-amber streaming-wave" style="animation-delay: 200ms" />
                <span class="w-3.5 h-3.5 rounded-full bg-mint streaming-wave" style="animation-delay: 400ms" />
              </div>
              <div class="text-center">
                <p class="font-semibold text-navy mb-3">AI 正在准备...</p>
                <!-- 轮播提示文字（淡入淡出切换） -->
                <Transition name="hint-fade" mode="out-in">
                  <p :key="carouselIndex" class="text-sm text-navy/50 h-5">
                    {{ currentHint }}
                  </p>
                </Transition>
              </div>
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
                  <!-- 折叠头部（可点击切换，sticky 固定在滚动容器顶部，始终可见） -->
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
                    <!-- 折叠箭头图标：展开时 ▼，收起时旋转 -90deg 变 ▶ -->
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
                  <!-- 折叠区域：reasoning + content 均在内，用 v-show 控制（无 max-height 裁切与过渡卡顿） -->
                  <div v-show="!isReasoningCollapsed" class="pt-2">
                    <!-- reasoning：AI 推理过程 -->
                    <div v-if="reasoning" class="pl-3 border-l-2 border-mint/60 text-navy/40 italic">
                      {{ reasoning }}
                      <!-- 思考阶段打字机光标（done 时隐藏） -->
                      <span
                        v-if="isThinking && !isDone"
                        class="inline-block w-2 h-4 bg-mint streaming-cursor align-middle ml-0.5"
                      />
                    </div>
                    <!-- content（JSON 行程数据）：coral 竖线 + 标签 -->
                    <div
                      v-if="content"
                      class="pt-2 mt-2 pl-3 border-l-2 border-coral text-navy/80 not-italic"
                    >
                      <div class="text-[10px] uppercase tracking-wider text-coral/70 font-semibold mb-1">行程数据</div>
                      {{ content }}
                      <!-- 生成阶段打字机光标（done 时隐藏） -->
                      <span
                        v-if="!isDone"
                        class="inline-block w-2 h-4 bg-coral streaming-cursor align-middle ml-0.5"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- 回到底部按钮：用户上滑后显示，点击平滑滚到底部并恢复自动跟随 -->
              <Transition name="scroll-bottom-fade">
                <button
                  v-if="!isAtBottom"
                  @click="scrollToBottom"
                  type="button"
                  aria-label="回到底部"
                  class="absolute bottom-3 right-3 flex items-center gap-1 px-3 py-2 rounded-full bg-coral text-white text-xs font-semibold shadow-lg hover:scale-110 hover:bg-coral/90 active:scale-95 transition-all duration-200"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7-7-7M12 21V3" />
                  </svg>
                  <span>最新</span>
                </button>
              </Transition>
            </div>

            <!-- 坐标补充进度：enrichPlanItems 阶段实时反馈 -->
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
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 顶部循环进度条（不确定进度，循环表示"进行中"） */
.streaming-progress {
  width: 30%;
  animation: streaming-progress 1.6s ease-in-out infinite;
}
@keyframes streaming-progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

/* 旋转渐变光环背景 */
.streaming-halo {
  background: conic-gradient(
    from 0deg,
    transparent,
    #4ECDC4,
    transparent 30%,
    #FF6B6B,
    transparent 60%,
    #FFD93D,
    transparent
  );
  filter: blur(24px);
  animation: streaming-spin 4s linear infinite;
}
@keyframes streaming-spin {
  to { transform: rotate(360deg); }
}

/* 3 个圆点波浪式跳动 */
.streaming-wave {
  animation: streaming-wave 1.2s ease-in-out infinite;
}
@keyframes streaming-wave {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.55; }
  30% { transform: translateY(-8px); opacity: 1; }
}

/* 顶部图标脉动 */
.streaming-pulse {
  animation: streaming-pulse 1.5s ease-in-out infinite;
}
@keyframes streaming-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.18); opacity: 0.75; }
}

/* 打字机光标闪烁 */
.streaming-cursor {
  animation: streaming-blink 1s steps(1) infinite;
}
@keyframes streaming-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

/* 轮播提示文字淡入淡出 */
.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.3s ease;
}
.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
}

/* 回到底部按钮淡入淡出 + 轻微上移 */
.scroll-bottom-fade-enter-active,
.scroll-bottom-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.scroll-bottom-fade-enter-from,
.scroll-bottom-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 移动端：减小光环尺寸与模糊半径，降低渲染压力 */
@media (max-width: 640px) {
  .streaming-halo {
    width: 44vw;
    height: 44vw;
    filter: blur(16px);
  }
}
</style>
