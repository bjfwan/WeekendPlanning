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
}

const props = defineProps<Props>()

// 流式内容容器引用，用于自动滚动到底部
const streamRef = ref<HTMLElement | null>(null)

// 思考过程折叠状态：true=收起，false=展开
// 默认根据当前是否已有 content 决定（生成阶段默认收起）
const isReasoningCollapsed = ref(props.content.length > 0)
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

// 思考状态指示文本
const reasoningStatus = computed(() => (isThinking.value ? '思考中...' : '已完成'))

// 思考内容字数统计
const reasoningWordCount = computed(() => props.reasoning.length)

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

// 监听 content 变化，自动管理思考过程折叠状态：
// - content 从空变为有内容（进入生成阶段）：若用户未手动操作过，自动收起
// - content 从有内容变为空（新一轮生成开始）：重置用户操作标记并展开
watch(
  () => props.content,
  (newVal, oldVal) => {
    const wasEmpty = !oldVal
    const isEmpty = !newVal
    if (wasEmpty && newVal && !userToggled.value) {
      // 进入生成阶段，自动收起思考过程
      isReasoningCollapsed.value = true
    } else if (oldVal && isEmpty) {
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

// 自动滚动流式内容到底部
watch([() => props.content, () => props.reasoning], async () => {
  await nextTick()
  if (streamRef.value) {
    streamRef.value.scrollTop = streamRef.value.scrollHeight
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- 渐变边框卡片（coral -> amber -> mint） -->
    <div class="relative p-[2px] rounded-3xl bg-gradient-to-br from-coral via-amber to-mint shadow-card">
      <div class="relative rounded-3xl bg-white overflow-hidden">
        <!-- 顶部循环进度条（不确定进度，循环表示"进行中"） -->
        <div class="h-1 w-full bg-navy/5 overflow-hidden">
          <div class="streaming-progress h-full bg-gradient-to-r from-coral via-amber to-mint" />
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
              <span class="text-2xl streaming-pulse">{{ isThinking ? '🧠' : '📝' }}</span>
              <span class="font-semibold text-navy">
                {{ isThinking ? 'AI 正在思考最佳方案...' : 'AI 正在为你规划行程...' }}
              </span>
            </div>

            <!-- 流式文本展示区 -->
            <div
              ref="streamRef"
              class="max-h-[50vh] overflow-y-auto p-4 rounded-xl bg-cream/50 font-mono text-sm whitespace-pre-wrap leading-relaxed"
            >
              <!-- 思考过程：可折叠区域 -->
              <div v-if="reasoning" class="mb-3">
                <!-- 折叠头部（可点击切换） -->
                <div
                  @click="toggleReasoning"
                  class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-mint/5 hover:bg-mint/10 cursor-pointer transition-colors duration-200"
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
                <!-- 思考内容（max-height 过渡动画） -->
                <div class="reasoning-collapse-wrapper" :class="{ 'collapsed': isReasoningCollapsed }">
                  <div class="pt-2 pl-3 border-l-2 border-mint/60 text-navy/40 italic">
                    {{ reasoning }}
                    <!-- 思考阶段打字机光标 -->
                    <span
                      v-if="isThinking"
                      class="inline-block w-2 h-4 bg-mint streaming-cursor align-middle ml-0.5"
                    />
                  </div>
                </div>
              </div>
              <!-- 实际内容：正常透明度 + coral 竖线 -->
              <div
                v-if="content"
                class="pl-3 border-l-2 border-coral text-navy/80 not-italic"
              >
                {{ content }}
                <!-- 生成阶段打字机光标 -->
                <span class="inline-block w-2 h-4 bg-coral streaming-cursor align-middle ml-0.5" />
              </div>
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

/* 思考过程折叠/展开动画：通过 max-height + opacity 过渡实现 */
.reasoning-collapse-wrapper {
  max-height: 3000px;
  opacity: 1;
  overflow: hidden;
  transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
}
.reasoning-collapse-wrapper.collapsed {
  max-height: 0;
  opacity: 0;
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

/* 移动端：减小光环尺寸与模糊半径，降低渲染压力 */
@media (max-width: 640px) {
  .streaming-halo {
    width: 44vw;
    height: 44vw;
    filter: blur(16px);
  }
}
</style>
