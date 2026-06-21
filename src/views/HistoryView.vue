<script setup lang="ts">
/** 历史规划页 - 展示当前匿名账户下生成过的所有行程 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { PlanRecord } from '@weekend-planner/shared'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import ShareModal from '@/components/ShareModal.vue'
import { useAuth } from '@/composables/useAuth'
import { fetchMyPlans } from '@/composables/useShare'

const router = useRouter()
const { user, ensureSession } = useAuth()

// 模块级缓存（跨导航生效）：缓存行程列表与获取时间
let cachedPlans: PlanRecord[] | null = null
let cachedAt = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

// 根据缓存状态初始化：有有效缓存则直接用缓存数据，不显示骨架屏
const hasValidCache = cachedPlans !== null && Date.now() - cachedAt < CACHE_TTL
const plans = ref<PlanRecord[]>(hasValidCache ? cachedPlans! : [])
const loading = ref(!hasValidCache)
// 错误提示
const errorMsg = ref('')
// 轻提示（未分享等）
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

// 分享弹窗状态
const shareModalShow = ref(false)
const shareUrl = ref('')
const sharePlanTitle = ref('')
const sharePlanCity = ref('')

// 状态徽章配置
const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: '进行中', bg: 'bg-mint/15', text: 'text-mint' },
  completed: { label: '已完成', bg: 'bg-amber/20', text: 'text-amber' },
  draft: { label: '草稿', bg: 'bg-navy/10', text: 'text-navy/60' }
}

// 是否为空状态
const isEmpty = computed(() => !loading.value && !errorMsg.value && plans.value.length === 0)

// 显示轻提示，2 秒后自动消失
function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2000)
}

// 取城市首字（中文取第一个字，英文取首字母大写）
function getCityInitial(city: string): string {
  if (!city) return '📍'
  return city.charAt(0).toUpperCase()
}

// 时长文本：优先用 plan_data.days.length 推断
function getDurationText(plan: PlanRecord): string {
  const days = plan.plan_data?.days?.length ?? 0
  if (days === 0) return '半日'
  if (days === 1) return '1 天'
  return `${days} 天`
}

// 相对时间格式化：1 小时内显示"X 分钟前"，1 天内显示"X 小时前"，超过 7 天显示日期
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  // 超过 7 天显示具体日期
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 拉取行程列表：支持缓存与强制刷新
async function loadPlans(force = false) {
  // 非强制且缓存有效：直接用缓存，不显示 loading
  if (!force && cachedPlans && Date.now() - cachedAt < CACHE_TTL) {
    plans.value = cachedPlans
    return
  }
  const userId = user.value?.id
  if (!userId) {
    errorMsg.value = '用户身份未就绪，请稍后重试'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await fetchMyPlans(userId)
    plans.value = data
    cachedPlans = data
    cachedAt = Date.now()
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '加载历史行程失败'
  } finally {
    loading.value = false
  }
}

// 点击卡片：有 share_code 跳转详情页，否则提示未分享
function handleCardClick(plan: PlanRecord) {
  if (plan.share_code) {
    router.push({ name: 'plan-detail', params: { code: plan.share_code } })
  } else {
    showToast('该行程未分享')
  }
}

// 分享按钮：弹出分享弹窗（复制逻辑由 ShareModal 内部管理）
function handleShare(plan: PlanRecord) {
  if (!plan.share_code) {
    showToast('该行程未分享')
    return
  }
  // 分享给别人是 /join/:code，让对方加入协同
  shareUrl.value = `${window.location.origin}/join/${plan.share_code}`
  sharePlanTitle.value = plan.title || '未命名行程'
  sharePlanCity.value = plan.city || '未知城市'
  shareModalShow.value = true
}

// 关闭分享弹窗
function closeShareModal() {
  shareModalShow.value = false
}

// 返回首页
function goHome() {
  router.push({ name: 'home' })
}

// 页面挂载：确保 session 后拉取历史行程（命中缓存则直接渲染）
onMounted(async () => {
  await ensureSession()
  await loadPlans(false)
})
</script>

<template>
  <div class="min-h-screen relative overflow-hidden">
    <!-- 装饰背景 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-coral/10 blur-3xl" />
      <div class="absolute top-40 -right-20 w-80 h-80 rounded-full bg-mint/10 blur-3xl" />
      <div class="absolute bottom-0 left-1/3 w-64 h-64 rounded-full bg-amber/10 blur-3xl" />
    </div>

    <div class="relative max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <!-- 顶部：标题 + 操作按钮 -->
      <header class="flex items-start justify-between gap-4 mb-8">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white shadow-card text-sm font-medium text-coral mb-4">
            <span class="w-2 h-2 rounded-full bg-coral animate-pulse" />
            📚 我的行程
          </div>
          <h1 class="font-display text-3xl sm:text-4xl font-bold text-navy mb-2 leading-tight">
            我的<span class="text-coral">行程</span>
          </h1>
          <p class="text-base text-navy/60">查看你生成过的所有周末计划</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <!-- 刷新按钮：强制重新请求，刷新时图标旋转 -->
          <BaseButton
            variant="ghost"
            size="sm"
            :disabled="loading"
            @click="loadPlans(true)"
          >
            <span :class="['inline-block', loading && 'animate-spin']">🔄</span>
            刷新
          </BaseButton>
          <BaseButton variant="ghost" size="sm" @click="goHome">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            返回首页
          </BaseButton>
        </div>
      </header>

      <!-- 加载中：骨架屏 -->
      <div v-if="loading" class="grid sm:grid-cols-2 gap-4">
        <div
          v-for="i in 4"
          :key="i"
          class="bg-white rounded-2xl p-6 shadow-card animate-pulse"
        >
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-full bg-navy/10" />
            <div class="flex-1 space-y-2">
              <div class="h-5 bg-navy/10 rounded w-3/4" />
              <div class="h-3 bg-navy/10 rounded w-1/2" />
              <div class="flex gap-2 pt-1">
                <div class="h-6 bg-navy/10 rounded-full w-14" />
                <div class="h-6 bg-navy/10 rounded-full w-14" />
                <div class="h-6 bg-navy/10 rounded-full w-14" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 加载失败 -->
      <BaseCard v-else-if="errorMsg" padding="lg" class="text-center">
        <div class="text-5xl mb-3">😵</div>
        <h2 class="text-lg font-bold text-navy mb-2">加载失败</h2>
        <p class="text-sm text-navy/60 mb-6">{{ errorMsg }}</p>
        <BaseButton @click="goHome">返回首页</BaseButton>
      </BaseCard>

      <!-- 空状态 -->
      <BaseCard v-else-if="isEmpty" padding="lg" class="text-center">
        <div class="text-6xl mb-4">🗺️</div>
        <h2 class="text-xl font-bold text-navy mb-2">还没有行程</h2>
        <p class="text-navy/50 mb-6">去生成第一个周末计划吧！</p>
        <BaseButton @click="goHome">🚀 开始规划</BaseButton>
      </BaseCard>

      <!-- 行程卡片列表 -->
      <div v-else class="grid sm:grid-cols-2 gap-4">
        <BaseCard
          v-for="plan in plans"
          :key="plan.id"
          padding="md"
          hover
          class="group"
          @click="handleCardClick(plan)"
        >
          <div class="flex items-start gap-4">
            <!-- 左侧：城市首字图标 -->
            <div class="shrink-0 w-14 h-14 grid place-items-center rounded-full bg-coral text-white text-xl font-bold shadow-md">
              {{ getCityInitial(plan.city) }}
            </div>

            <!-- 中部：行程信息 -->
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-navy truncate group-hover:text-coral transition-colors">
                {{ plan.title || '未命名行程' }}
              </h3>
              <p class="text-xs text-navy/60 mt-0.5 truncate">
                📍 {{ plan.city || '未知城市' }}
                <span v-if="plan.date"> · 📅 {{ plan.date }}</span>
              </p>

              <!-- 标签：时长、预算、人数 -->
              <div class="flex flex-wrap gap-1.5 mt-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-mint/10 text-mint">
                  ⏱ {{ getDurationText(plan) }}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber/15 text-navy">
                  💰 ¥{{ plan.budget ?? 0 }}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-navy/5 text-navy/60">
                  👥 {{ plan.people ?? 0 }} 人
                </span>
              </div>

              <!-- 创建时间 -->
              <p class="text-xs text-navy/40 mt-2">
                创建于 {{ formatRelativeTime(plan.created_at) }}
              </p>
            </div>

            <!-- 右侧：状态徽章 + 操作 -->
            <div class="shrink-0 flex flex-col items-end gap-2">
              <!-- 状态徽章 -->
              <span
                :class="[
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                  statusConfig[plan.status]?.bg ?? 'bg-navy/10',
                  statusConfig[plan.status]?.text ?? 'text-navy/60'
                ]"
              >
                {{ statusConfig[plan.status]?.label ?? plan.status }}
              </span>

              <!-- 分享按钮：stop 阻止冒泡触发卡片点击 -->
              <button
                type="button"
                @click.stop="handleShare(plan)"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-navy/60 border border-navy/10 hover:border-coral hover:text-coral transition-all duration-200 cursor-pointer"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                分享
              </button>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- 轻提示 toast -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="translate-y-4 opacity-0"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="toast"
        class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-navy text-white text-sm font-medium shadow-lg"
      >
        {{ toast }}
      </div>
    </Transition>

    <!-- 分享弹窗：复制逻辑由 ShareModal 内部管理 -->
    <ShareModal
      :show="shareModalShow"
      :share-url="shareUrl"
      :plan-title="sharePlanTitle"
      :plan-city="sharePlanCity"
      @close="closeShareModal"
    />
  </div>
</template>
