<script setup lang="ts">
/** 行程结果页 - 接收表单数据，流式生成并展示行程 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlan, planRequest } from '@/composables/usePlan'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import PlanTimeline from '@/components/PlanTimeline.vue'
import PlanChecklist from '@/components/PlanChecklist.vue'

const router = useRouter()
const { content, reasoning, plan, status, error, generatePlan, retry, cancel } = usePlan()

// 当前选中的日期 tab
const activeDay = ref(0)

// 分享链接复制状态
const shareCopied = ref(false)

// 流式内容容器引用，用于自动滚动
const streamRef = ref<HTMLElement | null>(null)

// 是否有有效的表单数据
const hasRequest = computed(() => planRequest.value !== null)

// 当前行程数据
const currentPlan = computed(() => plan.value)

// 是否处于思考阶段（有思考内容但还没有正式回答内容）
const isThinking = computed(() => reasoning.value.length > 0 && content.value.length === 0)

// 当前展示的日期行程
const currentDay = computed(() => {
  if (!currentPlan.value || !currentPlan.value.days.length) return null
  return currentPlan.value.days[activeDay.value] ?? currentPlan.value.days[0]
})

// 自动滚动流式内容到底部
watch([content, reasoning], async () => {
  await nextTick()
  if (streamRef.value) {
    streamRef.value.scrollTop = streamRef.value.scrollHeight
  }
})

// 切换日期 tab
function switchDay(idx: number) {
  activeDay.value = idx
}

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

// 复制分享链接
async function handleShare() {
  if (!currentPlan.value) return
  // 使用 planId 生成分享码（截取后 6 位）
  const shareCode = currentPlan.value.id.replace(/^plan_/, '').slice(0, 8)
  const shareUrl = `${window.location.origin}/join/${shareCode}`
  try {
    await navigator.clipboard.writeText(shareUrl)
    shareCopied.value = true
    setTimeout(() => (shareCopied.value = false), 2000)
  } catch {
    // 剪贴板不可用时回退到选中文本
    const input = document.createElement('input')
    input.value = shareUrl
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    shareCopied.value = true
    setTimeout(() => (shareCopied.value = false), 2000)
  }
}

// 页面挂载时自动开始生成
onMounted(() => {
  if (planRequest.value) {
    generatePlan(planRequest.value)
  }
})

// 离开页面时取消请求
onUnmounted(() => {
  cancel()
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
              @click="handleShare"
            >
              {{ shareCopied ? '✓ 已复制' : '🔗 分享链接' }}
            </BaseButton>
          </div>
        </div>

        <!-- 流式生成中 -->
        <div v-if="status === 'streaming'" class="space-y-4">
          <BaseCard padding="lg">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex gap-1.5">
                <span class="w-3 h-3 rounded-full bg-coral animate-bounce" style="animation-delay: 0ms" />
                <span class="w-3 h-3 rounded-full bg-amber animate-bounce" style="animation-delay: 150ms" />
                <span class="w-3 h-3 rounded-full bg-mint animate-bounce" style="animation-delay: 300ms" />
              </div>
              <span class="font-semibold text-navy">
                {{ isThinking ? 'AI 正在思考最佳方案...' : 'AI 正在为你规划行程...' }}
              </span>
            </div>
            <!-- 流式文本展示区 -->
            <div
              ref="streamRef"
              class="max-h-[50vh] overflow-y-auto p-4 rounded-xl bg-cream/50 font-mono text-sm text-navy/80 whitespace-pre-wrap leading-relaxed"
            >
              <!-- 思考过程（dimmed） -->
              <div v-if="reasoning" class="text-navy/40 italic mb-2">
                <span class="inline-block w-2 h-4 bg-mint/60 animate-pulse align-middle mr-1" />
                {{ reasoning }}
              </div>
              <!-- 实际回答内容 -->
              <div v-if="content" class="text-navy/80 not-italic">
                {{ content }}
                <span class="inline-block w-2 h-4 bg-coral animate-pulse align-middle ml-0.5" />
              </div>
              <div v-if="!reasoning && !content" class="text-navy/40">
                等待 AI 响应...
              </div>
            </div>
          </BaseCard>
        </div>

        <!-- 生成出错 -->
        <div v-else-if="status === 'error'" class="text-center py-16">
          <div class="text-5xl mb-4">😵</div>
          <h2 class="text-xl font-bold text-navy mb-2">生成失败</h2>
          <p class="text-navy/50 mb-6">{{ error || '请稍后重试' }}</p>
          <BaseButton @click="handleRetry">重新生成</BaseButton>
        </div>

        <!-- 行程展示 -->
        <div v-else-if="status === 'done' && currentPlan" class="space-y-6">
          <!-- 行程头部 -->
          <BaseCard padding="lg" class="sm:rounded-3xl">
            <div class="flex flex-wrap items-start justify-between gap-4">
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

            <!-- 天气信息 -->
            <div v-if="currentPlan.weather" class="mt-4 flex items-center gap-3 p-3 rounded-xl bg-mint/10">
              <span class="text-2xl">🌤️</span>
              <div>
                <p class="text-sm font-semibold text-navy">
                  {{ currentPlan.weather.condition }} · {{ currentPlan.weather.temperature }}
                </p>
                <p class="text-xs text-navy/60">{{ currentPlan.weather.suggestion }}</p>
              </div>
            </div>
          </BaseCard>

          <!-- 每日行程 -->
          <div v-if="currentPlan.days.length">
            <!-- 日期切换 tab -->
            <div v-if="currentPlan.days.length > 1" class="flex gap-2 mb-4 overflow-x-auto pb-1">
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

            <!-- 时间轴 -->
            <BaseCard padding="md">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-navy">
                  第 {{ currentDay?.day }} 天行程
                </h3>
                <span v-if="currentDay" class="text-sm text-navy/50">{{ currentDay.date }}</span>
              </div>
              <PlanTimeline v-if="currentDay" :day="currentDay" />
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
  </div>
</template>
