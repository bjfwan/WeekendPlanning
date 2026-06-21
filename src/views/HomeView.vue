<script setup lang="ts">
/** 首页 - 需求输入表单 */
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { PlanDuration, TransportMode } from '@weekend-planner/shared'
import { planRequest } from '@/composables/usePlan'
import BaseButton from '@/components/BaseButton.vue'
import BaseInput from '@/components/BaseInput.vue'
import BaseTag from '@/components/BaseTag.vue'
import BaseCard from '@/components/BaseCard.vue'
import DatePicker from '@/components/DatePicker.vue'

const router = useRouter()

// 表单数据
const form = reactive({
  city: '',
  date: '',
  duration: '1-day' as PlanDuration,
  budget: 500,
  people: 2,
  mood: [] as string[],
  interests: [] as string[],
  transport: 'public' as TransportMode
})

// 表单校验错误
const errors = reactive({
  city: '',
  date: '',
  budget: '',
  people: ''
})

// 提交中状态
const submitting = ref(false)

// 心情选项
const moodOptions = [
  { label: '放松', emoji: '😌' },
  { label: '探险', emoji: '🧗' },
  { label: '美食', emoji: '🍜' },
  { label: '文化', emoji: '🏛️' },
  { label: '浪漫', emoji: '💕' },
  { label: '亲子', emoji: '👨‍👩‍👧' },
  { label: '朋友聚会', emoji: '🎉' },
  { label: '独自享受', emoji: '🚶' }
]

// 兴趣选项
const interestOptions = [
  { label: '自然风光', emoji: '🌿' },
  { label: '历史古迹', emoji: '🏯' },
  { label: '美食', emoji: '🍽️' },
  { label: '购物', emoji: '🛍️' },
  { label: '艺术', emoji: '🎨' },
  { label: '夜生活', emoji: '🌃' },
  { label: '运动', emoji: '⚽' },
  { label: '摄影', emoji: '📷' }
]

// 时长选项
const durationOptions: { value: PlanDuration; label: string; emoji: string }[] = [
  { value: 'half-day', label: '半日游', emoji: '🌅' },
  { value: '1-day', label: '一日游', emoji: '☀️' },
  { value: '2-day', label: '两日游', emoji: '📆' },
  { value: '3-day', label: '三日游', emoji: '🎒' }
]

// 出行方式选项
const transportOptions: { value: TransportMode; label: string; emoji: string }[] = [
  { value: 'public', label: '公共交通', emoji: '🚌' },
  { value: 'driving', label: '自驾', emoji: '🚗' },
  { value: 'walking', label: '步行', emoji: '🚶' },
  { value: 'mixed', label: '混合', emoji: '🚇' }
]

// 切换标签选中（多选）
function toggleTag(list: string[], label: string) {
  const idx = list.indexOf(label)
  if (idx >= 0) {
    list.splice(idx, 1)
  } else {
    list.push(label)
  }
}

// 格式化日期为 YYYY-MM-DD（使用本地时区，避免 toISOString 的时区偏移问题）
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取今天日期对象（清零时分秒，避免时间影响日期比较）
function getTodayDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 获取明天日期
function getTomorrowDate(): Date {
  const d = getTodayDate()
  d.setDate(d.getDate() + 1)
  return d
}

// 获取本周末（最近的周六；若今日为周六则为今天）
function getWeekendDate(): Date {
  const d = getTodayDate()
  const dayOfWeek = d.getDay() // 0 = 周日, 6 = 周六
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7
  d.setDate(d.getDate() + daysUntilSaturday)
  return d
}

// 今日日期，用于 date input 最小值
const today = formatDate(getTodayDate())

// 日期快捷选项
const quickDateOptions = [
  { key: 'today', label: '今天', emoji: '📌' },
  { key: 'tomorrow', label: '明天', emoji: '🌅' },
  { key: 'weekend', label: '本周末', emoji: '🎉' }
]

// 当前选中的快捷选项（根据 form.date 自动匹配）
const activeQuickOption = computed<string | null>(() => {
  if (!form.date) return null
  if (form.date === formatDate(getTodayDate())) return 'today'
  if (form.date === formatDate(getTomorrowDate())) return 'tomorrow'
  if (form.date === formatDate(getWeekendDate())) return 'weekend'
  return null
})

// 点击快捷选项，填入对应日期
function selectQuickDate(key: string) {
  let date: Date
  if (key === 'today') date = getTodayDate()
  else if (key === 'tomorrow') date = getTomorrowDate()
  else date = getWeekendDate()
  form.date = formatDate(date)
}

// 表单校验
function validate(): boolean {
  errors.city = form.city.trim() ? '' : '请输入城市'
  errors.date = form.date ? '' : '请选择日期'
  errors.budget = form.budget > 0 ? '' : '预算需大于 0'
  errors.people = form.people > 0 ? '' : '人数需大于 0'
  return !errors.city && !errors.date && !errors.budget && !errors.people
}

// 是否可提交
const canSubmit = computed(
  () => form.city.trim() && form.date && form.budget > 0 && form.people > 0
)

// 提交表单
function handleSubmit() {
  if (!validate()) return
  submitting.value = true
  // 写入共享状态供 PlanView 读取
  planRequest.value = { ...form }
  router.push({ name: 'plan' })
}
</script>

<template>
  <div class="min-h-screen relative overflow-hidden">
    <!-- 装饰背景 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-coral/10 blur-3xl" />
      <div class="absolute top-40 -right-20 w-80 h-80 rounded-full bg-mint/10 blur-3xl" />
      <div class="absolute bottom-0 left-1/3 w-64 h-64 rounded-full bg-amber/10 blur-3xl" />
    </div>

    <div class="relative max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <!-- 右上角：我的行程入口 -->
      <button
        type="button"
        @click="router.push({ name: 'history' })"
        class="absolute top-8 right-4 sm:top-10 sm:right-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white shadow-card text-sm font-medium text-navy/70 hover:text-coral hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border border-navy/5"
      >
        📚 我的行程
      </button>

      <!-- 头部 -->
      <header class="text-center mb-10">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white shadow-card text-sm font-medium text-coral mb-5">
          <span class="w-2 h-2 rounded-full bg-coral animate-pulse" />
          AI 智能行程生成
        </div>
        <h1 class="font-display text-4xl sm:text-5xl font-bold text-navy mb-3 leading-tight">
          你的<span class="text-coral">完美周末</span>
          <br class="sm:hidden" />从这里开始
        </h1>
        <p class="text-base sm:text-lg text-navy/60 max-w-xl mx-auto">
          告诉我你的想法，3 分钟生成可执行的周末行程 ✨
        </p>
      </header>

      <!-- 表单卡片 -->
      <BaseCard padding="lg" class="sm:rounded-3xl">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- 城市 + 日期 -->
          <div class="grid sm:grid-cols-2 gap-4">
            <BaseInput
              v-model="form.city"
              label="目的地城市"
              placeholder="例如：杭州"
              :error="errors.city"
              required
            />
            <div class="w-full">
              <label class="block mb-2 text-sm font-semibold text-navy">
                出发日期
                <span class="text-coral">*</span>
              </label>
              <!-- 快捷选项按钮 -->
              <div class="flex flex-wrap gap-1.5 mb-2">
                <button
                  v-for="opt in quickDateOptions"
                  :key="opt.key"
                  type="button"
                  @click="selectQuickDate(opt.key)"
                  :class="[
                    'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border-2 outline-none cursor-pointer',
                    'focus-visible:ring-4 focus-visible:ring-amber/30',
                    activeQuickOption === opt.key
                      ? 'bg-amber text-navy border-amber shadow-md scale-105'
                      : 'bg-white text-navy/70 border-navy/10 hover:border-amber/50 hover:bg-amber/5 hover:text-navy'
                  ]"
                >
                  <span class="leading-none">{{ opt.emoji }}</span>
                  <span>{{ opt.label }}</span>
                </button>
              </div>
              <!-- 自定义日历选择器 -->
              <DatePicker
                v-model="form.date"
                :min="today"
                :error="errors.date"
                placeholder="请选择出发日期"
                required
              />
            </div>
          </div>

          <!-- 时长选择 -->
          <div>
            <label class="block mb-2.5 text-sm font-semibold text-navy">行程时长</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                v-for="opt in durationOptions"
                :key="opt.value"
                type="button"
                @click="form.duration = opt.value"
                :class="[
                  'flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all duration-200 outline-none',
                  'focus-visible:ring-4 focus-visible:ring-coral/25',
                  form.duration === opt.value
                    ? 'bg-coral text-white border-coral shadow-md scale-[1.02]'
                    : 'bg-white text-navy border-navy/10 hover:border-coral/40'
                ]"
              >
                <span class="text-xl">{{ opt.emoji }}</span>
                <span class="text-sm font-medium">{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <!-- 预算 + 人数 -->
          <div class="grid sm:grid-cols-2 gap-4">
            <BaseInput
              v-model="form.budget"
              label="预算（元）"
              type="number"
              :min="1"
              :error="errors.budget"
              required
            />
            <BaseInput
              v-model="form.people"
              label="出行人数"
              type="number"
              :min="1"
              :error="errors.people"
              required
            />
          </div>

          <!-- 心情选择 -->
          <div>
            <label class="block mb-2.5 text-sm font-semibold text-navy">
              今天的心情
              <span class="font-normal text-navy/40">（可多选）</span>
            </label>
            <div class="flex flex-wrap gap-2">
              <BaseTag
                v-for="opt in moodOptions"
                :key="opt.label"
                :emoji="opt.emoji"
                :selected="form.mood.includes(opt.label)"
                @click="toggleTag(form.mood, opt.label)"
              >
                {{ opt.label }}
              </BaseTag>
            </div>
          </div>

          <!-- 兴趣选择 -->
          <div>
            <label class="block mb-2.5 text-sm font-semibold text-navy">
              感兴趣的方向
              <span class="font-normal text-navy/40">（可多选）</span>
            </label>
            <div class="flex flex-wrap gap-2">
              <BaseTag
                v-for="opt in interestOptions"
                :key="opt.label"
                :emoji="opt.emoji"
                :selected="form.interests.includes(opt.label)"
                @click="toggleTag(form.interests, opt.label)"
              >
                {{ opt.label }}
              </BaseTag>
            </div>
          </div>

          <!-- 出行方式 -->
          <div>
            <label class="block mb-2.5 text-sm font-semibold text-navy">出行方式</label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                v-for="opt in transportOptions"
                :key="opt.value"
                type="button"
                @click="form.transport = opt.value"
                :class="[
                  'flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all duration-200 outline-none',
                  'focus-visible:ring-4 focus-visible:ring-coral/25',
                  form.transport === opt.value
                    ? 'bg-mint text-white border-mint shadow-md scale-[1.02]'
                    : 'bg-white text-navy border-navy/10 hover:border-mint/40'
                ]"
              >
                <span class="text-xl">{{ opt.emoji }}</span>
                <span class="text-sm font-medium">{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <!-- 提交按钮 -->
          <div class="pt-2">
            <BaseButton
              type="submit"
              size="lg"
              :loading="submitting"
              :disabled="!canSubmit"
              class="w-full"
            >
              <span v-if="!submitting">🚀 生成周末行程</span>
              <span v-else>正在准备...</span>
            </BaseButton>
            <p class="text-center text-xs text-navy/40 mt-3">
              AI 将根据你的偏好生成个性化行程方案
            </p>
          </div>
        </form>
      </BaseCard>
    </div>
  </div>
</template>
