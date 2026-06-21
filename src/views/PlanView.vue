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

const router = useRouter()
const { content, reasoning, plan, status, error, generatePlan, retry, cancel } = usePlan()
const { user } = useAuth()

// 当前选中的日期 tab
const activeDay = ref(0)

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

// 生成完成的庆祝动画状态（done 时短暂展示 ✓ 与闪光）
const showCelebration = ref(false)
let celebrationTimer: ReturnType<typeof setTimeout> | null = null

// 是否有有效的表单数据
const hasRequest = computed(() => planRequest.value !== null)

// 当前行程数据
const currentPlan = computed(() => plan.value)

// 当前展示的日期行程
const currentDay = computed(() => {
  if (!currentPlan.value || !currentPlan.value.days.length) return null
  return currentPlan.value.days[activeDay.value] ?? currentPlan.value.days[0]
})

// 监听生成状态：done 时触发庆祝动画，2 秒后自动收起
watch(status, (newStatus) => {
  if (newStatus === 'done') {
    showCelebration.value = true
    if (celebrationTimer) clearTimeout(celebrationTimer)
    celebrationTimer = setTimeout(() => {
      showCelebration.value = false
    }, 2000)
  } else {
    showCelebration.value = false
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
  if (planRequest.value) {
    generatePlan(planRequest.value)
  }
})

// 离开页面时取消请求并清理定时器
onUnmounted(() => {
  cancel()
  if (celebrationTimer) clearTimeout(celebrationTimer)
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

        <!-- 流式生成中 -->
        <StreamingPanel
          v-if="status === 'streaming'"
          :content="content"
          :reasoning="reasoning"
        />

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
