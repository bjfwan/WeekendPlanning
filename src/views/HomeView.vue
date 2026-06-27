<script setup lang="ts">
/** 首页 - 需求输入表单 */
import { reactive, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import type { PlanDuration, TransportMode } from '@weekend-planner/shared'
import { planRequest } from '@/composables/usePlan'
import { useHapticFeedback } from '@/composables/useHapticFeedback'
import { useFormValidation } from '@/composables/useFormValidation'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'
import { useGsapNumber } from '@/composables/useGsapNumber'
import { CHINA_CITIES } from '@/data/cities'
import BaseButton from '@/components/BaseButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import DatePicker from '@/components/DatePicker.vue'
import CityAutocomplete from '@/components/form/CityAutocomplete.vue'
import BudgetSelector from '@/components/form/BudgetSelector.vue'
import PeopleStepper from '@/components/form/PeopleStepper.vue'
import PreferencePicker from '@/components/form/PreferencePicker.vue'
import {
  Sunrise,
  Sun,
  CalendarDays,
  Backpack,
  Bus,
  Car,
  Footprints,
  TrainFront,
  Rocket
} from '@lucide/vue'
import type { Component } from 'vue'

const router = useRouter()
const { trigger: triggerHaptic } = useHapticFeedback()
const { gsap, matchMedia, context, EASE_OUT, EASE_BACK, EASE_EXPO } = useGsap()

// 表单数据
const form = reactive({
  city: '杭州',
  date: '',
  duration: '1-day' as PlanDuration,
  budget: 500,
  people: 2,
  preferences: [] as string[],
  transport: 'public' as TransportMode
})

// 表单验证
type ValidationFields = {
  city: string
  date: string
  budget: number
  people: number
  preferences: string[]
}

/** 检查日期是否不早于今天 */
function isDateNotBeforeToday(val: string): boolean {
  if (!val) return true // 空值由 required 规则处理
  const parts = val.split('-')
  if (parts.length !== 3) return false
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  if (isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() >= today.getTime()
}

const { errors, validateField, validateAll, clearError, hasErrors } =
  useFormValidation<ValidationFields>({
    city: [
      { type: 'required', message: '请选择目的地城市' },
      {
        type: 'custom',
        validator: (val) => CHINA_CITIES.some((c) => c.name === val),
        message: '请从下拉列表中选择城市'
      }
    ],
    date: [
      { type: 'required', message: '请选择出行日期' },
      {
        type: 'custom',
        validator: (val) => isDateNotBeforeToday(String(val)),
        message: '日期不能早于今天'
      }
    ],
    budget: [
      { type: 'min', value: 0, message: '预算不能为负' },
      { type: 'max', value: 10000, message: '预算超过上限，请合理设置' }
    ],
    people: [
      { type: 'min', value: 1, message: '至少 1 人' },
      { type: 'max', value: 10, message: '最多 10 人' }
    ],
    preferences: [
      {
        type: 'custom',
        validator: (val) => !Array.isArray(val) || val.length <= 5,
        message: '最多选择 5 项'
      }
    ]
  })
// 提交中状态
const submitting = ref(false)

// 表单状态播报（供 aria-live 区域读取）
const statusMessage = ref('')

// 时长选项（emoji 替换为 @lucide/vue 图标）
const durationOptions: { value: PlanDuration; label: string; icon: Component }[] = [
  { value: 'half-day', label: '半日游', icon: Sunrise },
  { value: '1-day', label: '一日游', icon: Sun },
  { value: '2-day', label: '两日游', icon: CalendarDays },
  { value: '3-day', label: '三日游', icon: Backpack }
]

// 出行方式选项（emoji 替换为 @lucide/vue 图标）
const transportOptions: { value: TransportMode; label: string; icon: Component }[] = [
  { value: 'public', label: '公共交通', icon: Bus },
  { value: 'driving', label: '自驾', icon: Car },
  { value: 'walking', label: '步行', icon: Footprints },
  { value: 'mixed', label: '混合', icon: TrainFront }
]

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

// 日期快捷选项（传给 DatePicker 的 quickOptions prop）
const quickDateOptions = [
  { key: 'today', label: '今天', date: formatDate(getTodayDate()) },
  { key: 'tomorrow', label: '明天', date: formatDate(getTomorrowDate()) },
  { key: 'weekend', label: '本周末', date: formatDate(getWeekendDate()) }
]

// 失焦时验证对应字段
function handleBlur(field: 'city' | 'date' | 'budget' | 'people' | 'preferences') {
  validateField(field, form[field])
}

// 输入时清除对应字段错误
watch(() => form.city, () => clearError('city'))
watch(() => form.date, () => clearError('date'))
watch(() => form.budget, () => clearError('budget'))
watch(() => form.people, () => clearError('people'))
watch(() => form.preferences, () => clearError('preferences'), { deep: true })

// 是否可提交
const canSubmit = computed(() => {
  // 必填字段检查
  if (!form.city.trim()) return false
  if (!form.date) return false
  // 无活动错误
  return !hasErrors()
})

// 提交表单
function handleSubmit() {
  if (!validateAll(form)) {
    // 校验失败：播报 + 错误触觉反馈
    statusMessage.value = '生成失败'
    triggerHaptic('error')
    return
  }
  // 提交成功：播报进度 + 成功触觉反馈
  statusMessage.value = '正在生成行程...'
  triggerHaptic('success')
  submitting.value = true
  // 写入共享状态供 PlanView 读取
  planRequest.value = { ...form }
  // 短暂延迟让屏幕阅读器读取"正在生成行程..."后再跳转
  router.push({ name: 'plan' })
}

/** 一键填充示例参数（演示用，让评委快速进入生成环节） */
function fillExample() {
  form.city = '杭州'
  form.date = formatDate(getTomorrowDate())
  form.duration = '1-day'
  form.budget = 500
  form.people = 2
  form.transport = 'public'
  form.preferences = ['放松', '美食', '自然风光']
  triggerHaptic('success')
}

// 数据证明条数据 - 拆分数字与后缀以便 useGsapNumber 滚动
const stats = [
  { num: 3, suffix: ' min', desc: '从需求到完整路线' },
  { num: 4, suffix: ' 类人群', desc: '上班族·情侣·亲子·游客' },
  { num: 1, suffix: ' 份清单', desc: '预算·交通·预约·备选' }
]

// 数字滚动目标（初始 0，Hero timeline 完成后置为目标值触发滚动）
const statTargets = [ref(0), ref(0), ref(0)]
const statDisplays = [
  useGsapNumber(() => statTargets[0].value, { duration: 1.2, ease: EASE_EXPO }),
  useGsapNumber(() => statTargets[1].value, { duration: 1.2, ease: EASE_EXPO }),
  useGsapNumber(() => statTargets[2].value, { duration: 1.2, ease: EASE_EXPO })
]
// 模板中使用的整数显示值
const statValues = computed(() => statDisplays.map((d) => Math.round(d.value)))

// ===== GSAP 动画相关元素引用 =====
const rootRef = ref<HTMLElement>()
const eyebrowRef = ref<HTMLElement>()
const h1Ref = ref<HTMLElement>()
const subtitleRef = ref<HTMLElement>()
const statsRef = ref<HTMLElement>()
const formCardWrapRef = ref<HTMLElement>()
const submitWrapRef = ref<HTMLElement>()

// 时长/出行方式按钮引用（按 value 索引，供选中弹性动画使用）
const durationBtnRefs: Record<string, HTMLElement> = {}
const transportBtnRefs: Record<string, HTMLElement> = {}
function setDurationBtnRef(val: string, el: unknown) {
  if (el instanceof HTMLElement) durationBtnRefs[val] = el
  else delete durationBtnRefs[val]
}
function setTransportBtnRef(val: string, el: unknown) {
  if (el instanceof HTMLElement) transportBtnRefs[val] = el
  else delete transportBtnRefs[val]
}

// 清理函数集合（事件监听、IntersectionObserver 等，非 gsap 托管资源）
const cleanups: (() => void)[] = []
/**
 * 选中按钮弹性动画
 * - 选中项：放大 + 阴影 pop（EASE_BACK 弹性），回弹到稳态放大态
 * - 取消选中项：缩回 + 阴影消失，清理内联样式
 * - 相邻项：轻微 x 偏移让位后回弹
 */
function animateSelection(
  btnRefs: Record<string, HTMLElement>,
  options: ReadonlyArray<{ value: string }>,
  newVal: string,
  oldVal: string
) {
  // reduced-motion：不做弹性动画，CSS 已处理颜色切换
  if (prefersReducedMotion()) return
  const newBtn = btnRefs[newVal]
  if (!newBtn) return
  const oldBtn = oldVal ? btnRefs[oldVal] : undefined
  const idx = options.findIndex((o) => o.value === newVal)
  const glowPop = 'drop-shadow(0 8px 16px rgba(255,107,107,0.45))'
  const glowRest = 'drop-shadow(0 6px 12px rgba(255,107,107,0.35))'
  const noGlow = 'drop-shadow(0 0 0px rgba(0,0,0,0))'
  const tl = gsap.timeline()
  // 选中项：放大 + 阴影弹性 pop，然后回弹到稳态
  tl.to(newBtn, { scale: 1.06, filter: glowPop, duration: 0.32, ease: EASE_BACK }, 0)
  tl.to(newBtn, { scale: 1.03, filter: glowRest, duration: 0.22, ease: EASE_OUT }, 0.32)
  // 取消选中项：缩回 + 阴影消失，清理内联样式以恢复 CSS 控制
  if (oldBtn && oldBtn !== newBtn) {
    tl.to(
      oldBtn,
      { scale: 1, filter: noGlow, duration: 0.3, ease: EASE_OUT, clearProps: 'transform,filter' },
      0
    )
  }
  // 相邻项轻微 x 偏移让位
  const leftBtn = idx > 0 ? btnRefs[options[idx - 1].value] : undefined
  const rightBtn = idx >= 0 && idx < options.length - 1 ? btnRefs[options[idx + 1].value] : undefined
  if (leftBtn && leftBtn !== newBtn) {
    tl.to(leftBtn, { x: -4, duration: 0.18, ease: EASE_OUT }, 0)
    tl.to(leftBtn, { x: 0, duration: 0.28, ease: EASE_OUT, clearProps: 'transform' }, 0.18)
  }
  if (rightBtn && rightBtn !== newBtn) {
    tl.to(rightBtn, { x: 4, duration: 0.18, ease: EASE_OUT }, 0)
    tl.to(rightBtn, { x: 0, duration: 0.28, ease: EASE_OUT, clearProps: 'transform' }, 0.18)
  }
}

/** 初始选中按钮设置稳态放大 + 阴影（onMounted 时调用） */
function initSelectedScale(btnRefs: Record<string, HTMLElement>, current: string) {
  const btn = btnRefs[current]
  if (btn) gsap.set(btn, { scale: 1.03, filter: 'drop-shadow(0 6px 12px rgba(255,107,107,0.35))' })
}

/** 监听选中值变化触发弹性动画 */
watch(
  () => form.duration,
  (newVal, oldVal) => {
    animateSelection(durationBtnRefs, durationOptions, newVal, oldVal)
  }
)
watch(
  () => form.transport,
  (newVal, oldVal) => {
    animateSelection(transportBtnRefs, transportOptions, newVal, oldVal)
  }
)

/**
 * 提交按钮磁性吸附 + ripple 涟漪
 * - 磁性：鼠标在包裹层移动时，用 gsap.quickTo 让按钮轻微跟随鼠标
 * - ripple：点击时从点击点扩散半透明圆，淡出消失
 * - 尊重 prefers-reduced-motion：禁用磁性，保留 ripple
 */
function setupSubmitButton() {
  const wrap = submitWrapRef.value
  if (!wrap) return
  const btn = wrap.querySelector('button') as HTMLButtonElement | null
  if (!btn) return
  // 按钮承载 ripple：相对定位 + 裁剪溢出
  btn.style.position = 'relative'
  btn.style.overflow = 'hidden'

  // 磁性跟随 quickTo（移动包裹层，避免与按钮自身 hover transform 冲突）
  const quickX = gsap.quickTo(wrap, 'x', { duration: 0.4, ease: EASE_OUT })
  const quickY = gsap.quickTo(wrap, 'y', { duration: 0.4, ease: EASE_OUT })

  function onMouseMove(e: MouseEvent) {
    // reduced-motion 或按钮禁用时不做磁性跟随
    if (!btn || prefersReducedMotion() || btn.disabled) return
    const rect = wrap!.getBoundingClientRect()
    const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.25
    const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.25
    quickX(dx)
    quickY(dy)
  }
  function onMouseLeave() {
    quickX(0)
    quickY(0)
  }
  function onClick(e: MouseEvent) {
    if (!btn || btn.disabled) return
    createRipple(btn, e)
  }

  wrap.addEventListener('mousemove', onMouseMove)
  wrap.addEventListener('mouseleave', onMouseLeave)
  wrap.addEventListener('click', onClick)
  cleanups.push(() => {
    wrap.removeEventListener('mousemove', onMouseMove)
    wrap.removeEventListener('mouseleave', onMouseLeave)
    wrap.removeEventListener('click', onClick)
  })
}

/** 从点击点扩散 ripple 涟漪 */
function createRipple(btn: HTMLButtonElement, e: MouseEvent) {
  const rect = btn.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const size = Math.max(rect.width, rect.height) * 1.5
  const ripple = document.createElement('span')
  ripple.style.cssText = `position:absolute;border-radius:9999px;pointer-events:none;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;background:rgba(255,255,255,0.45);transform:scale(0);z-index:0;`
  btn.appendChild(ripple)
  if (prefersReducedMotion()) {
    // reduced-motion：简单闪现后淡出
    gsap.set(ripple, { scale: 1 })
    gsap.to(ripple, { opacity: 0, duration: 0.35, ease: EASE_OUT, onComplete: () => ripple.remove() })
  } else {
    gsap.to(ripple, {
      scale: 1.4,
      opacity: 0,
      duration: 0.6,
      ease: EASE_OUT,
      onComplete: () => ripple.remove()
    })
  }
}
/** 表单分组分隔线滚动到视口时从左到右绘制（scaleX 0→1） */
function startSeparatorObserver() {
  const separators = Array.from(
    rootRef.value?.querySelectorAll('.form-separator') ?? []
  ) as HTMLElement[]
  if (!separators.length) return
  // 初始隐藏（transformOrigin 已在 CSS 中设为 left）
  gsap.set(separators, { scaleX: 0, opacity: 0, transformOrigin: 'left center' })
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          gsap.to(entry.target, { scaleX: 1, opacity: 1, duration: 0.8, ease: EASE_EXPO })
          io.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.4 }
  )
  separators.forEach((el) => io.observe(el))
  cleanups.push(() => io.disconnect())
}

onMounted(() => {
  // 用 context 包装所有 GSAP 动画，便于卸载时统一 revert
  context(() => {
    // 提交按钮磁性 + ripple（内部判断 reduced-motion，仅注册一次）
    setupSubmitButton()

    const mm = matchMedia((_ctx, isReduce) => {
      // ===== 1 & 2. Hero 入场 timeline + 数字滚动 =====
      if (isReduce) {
        // reduced-motion：即时显示，不动画
        gsap.set(
          [eyebrowRef.value, h1Ref.value, subtitleRef.value, statsRef.value].filter(
            Boolean
          ) as HTMLElement[],
          { opacity: 1, y: 0 }
        )
        if (formCardWrapRef.value) {
          gsap.set(formCardWrapRef.value, { opacity: 1, y: 0, scale: 1 })
        }
        // 数字直接置为目标值
        statTargets.forEach((t, i) => (t.value = stats[i].num))
        // 分隔线即时显示
        const seps = Array.from(
          rootRef.value?.querySelectorAll('.form-separator') ?? []
        ) as HTMLElement[]
        gsap.set(seps, { scaleX: 1, opacity: 1 })
      } else {
        // 初始隐藏分隔线（待 Hero 入场后启动观察绘制）
        const seps = Array.from(
          rootRef.value?.querySelectorAll('.form-separator') ?? []
        ) as HTMLElement[]
        gsap.set(seps, { scaleX: 0, opacity: 0, transformOrigin: 'left center' })
        // 初始选中按钮放大 + 阴影
        initSelectedScale(durationBtnRefs, form.duration)
        initSelectedScale(transportBtnRefs, form.transport)
        // Hero 入场 timeline
        const tl = gsap.timeline({
          defaults: { ease: EASE_OUT, duration: 0.7 },
          onComplete: () => {
            // Hero 入场完成后触发数字滚动
            statTargets.forEach((t, i) => (t.value = stats[i].num))
            // 启动分隔线滚动绘制观察
            startSeparatorObserver()
          }
        })
        if (eyebrowRef.value) tl.from(eyebrowRef.value, { y: 20, opacity: 0 }, 0)
        if (h1Ref.value) tl.from(h1Ref.value, { y: 30, opacity: 0 }, 0.1)
        if (subtitleRef.value) tl.from(subtitleRef.value, { y: 20, opacity: 0 }, 0.2)
        if (statsRef.value) tl.from(statsRef.value, { y: 20, opacity: 0 }, 0.3)
        if (formCardWrapRef.value) {
          tl.from(
            formCardWrapRef.value,
            { y: 40, opacity: 0, scale: 0.95, ease: EASE_BACK, duration: 0.8 },
            0.4
          )
        }
      }
    })
    cleanups.push(() => mm.kill())
  })
})

onBeforeUnmount(() => {
  // 清理非 gsap 托管的资源（事件监听、IntersectionObserver）
  cleanups.forEach((fn) => fn())
  cleanups.length = 0
})
</script>
<template>
  <div ref="rootRef" class="max-w-4xl mx-auto">
    <!-- Hero 区域 -->
    <header class="text-center mb-8 sm:mb-10">
      <!-- eyebrow 徽章 -->
      <div
        ref="eyebrowRef"
        class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber/10 text-sm font-medium text-coral mb-5"
      >
        <span class="w-2 h-2 rounded-full bg-coral animate-pulse" />
        3 分钟 · AI 生成
      </div>

      <!-- 主标题 -->
      <h1
        ref="h1Ref"
        class="font-display text-5xl sm:text-6xl font-bold text-navy mb-4 leading-[1.05] tracking-tight"
      >
        周末去哪玩？<span class="text-coral border-b-2 border-amber">3 分钟</span>帮你搞定
      </h1>

      <!-- 副标题 -->
      <p
        ref="subtitleRef"
        class="text-lg sm:text-xl text-navy/60 max-w-xl mx-auto"
      >
        输入城市、心情、预算和人数，AI 自动生成吃喝玩乐路线、时间安排和备选方案 ✨
      </p>

      <!-- 数据证明条（紧凑横排） -->
      <div
        ref="statsRef"
        class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-6 text-sm"
      >
        <template v-for="(stat, idx) in stats" :key="stat.suffix">
          <span class="inline-flex items-center gap-1.5">
            <span class="font-bold text-coral">{{ statValues[idx] }}{{ stat.suffix }}</span>
            <span class="text-navy/50">{{ stat.desc }}</span>
          </span>
          <span v-if="idx < stats.length - 1" class="text-navy/20">·</span>
        </template>
      </div>
    </header>

    <!-- 表单卡片 -->
    <div ref="formCardWrapRef">
      <BaseCard padding="lg" class="sm:rounded-3xl">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- 表单状态播报（屏幕阅读器专用） -->
          <div role="status" aria-live="polite" class="sr-only">{{ statusMessage }}</div>

          <!-- ========== 第一组：基础信息 ========== -->
          <section>
            <!-- 组标题 -->
            <div class="flex items-center gap-2 mb-4">
              <div class="w-1 h-4 bg-coral rounded-full" />
              <h2 class="text-sm font-bold text-navy">基础信息</h2>
            </div>

            <!-- 城市 + 日期 -->
            <div class="grid sm:grid-cols-2 gap-4 mb-4">
              <div class="w-full">
                <label class="block mb-2 text-sm font-semibold text-navy">
                  目的地城市
                  <span class="text-coral">*</span>
                </label>
                <CityAutocomplete
                  v-model="form.city"
                  :error="errors.city"
                  placeholder="例如：杭州"
                  @blur="handleBlur('city')"
                />
              </div>
              <div class="w-full">
                <label class="block mb-2 text-sm font-semibold text-navy">
                  出发日期
                  <span class="text-coral">*</span>
                </label>
                <DatePicker
                  v-model="form.date"
                  :min="today"
                  :quick-options="quickDateOptions"
                  :error="errors.date"
                  placeholder="请选择出发日期"
                  required
                  @blur="handleBlur('date')"
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
                  :ref="(el) => setDurationBtnRef(opt.value, el)"
                  type="button"
                  @click="form.duration = opt.value"
                  :class="[
                    'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 outline-none cursor-pointer',
                    'transition-colors duration-200',
                    'focus-visible:ring-4 focus-visible:ring-coral/20',
                    'active:scale-95',
                    form.duration === opt.value
                      ? 'bg-coral text-white border-coral'
                      : 'bg-white text-navy border-navy/10 [@media(hover:hover)]:hover:border-coral/40 [@media(hover:hover)]:hover:bg-coral/5'
                  ]"
                >
                  <component :is="opt.icon" :size="22" class="shrink-0" />
                  <span class="text-sm font-medium">{{ opt.label }}</span>
                </button>
              </div>
            </div>
          </section>
          <!-- ========== 第二组：出行配置 ========== -->
          <section class="relative pt-6">
            <!-- 分组分隔线（滚动到视口时从左到右绘制） -->
            <div class="form-separator absolute top-0 left-0 h-px w-full bg-navy/10 origin-left" />
            <!-- 组标题 -->
            <div class="flex items-center gap-2 mb-4">
              <div class="w-1 h-4 bg-coral rounded-full" />
              <h2 class="text-sm font-bold text-navy">出行配置</h2>
            </div>

            <!-- 预算 -->
            <div class="mb-6">
              <label class="block mb-2.5 text-sm font-semibold text-navy">
                预算（元）
                <span class="text-coral">*</span>
              </label>
              <BudgetSelector
                v-model="form.budget"
                :error="errors.budget"
                @blur="handleBlur('budget')"
              />
            </div>

            <!-- 人数 + 出行方式（双列布局） -->
            <div class="grid sm:grid-cols-2 gap-4">
              <!-- 人数 -->
              <div>
                <label class="block mb-2.5 text-sm font-semibold text-navy">
                  出行人数
                  <span class="text-coral">*</span>
                </label>
                <PeopleStepper
                  v-model="form.people"
                  :error="errors.people"
                  @blur="handleBlur('people')"
                />
              </div>

              <!-- 出行方式 -->
              <div>
                <label class="block mb-2.5 text-sm font-semibold text-navy">出行方式</label>
                <div class="grid grid-cols-2 gap-2.5">
                  <button
                    v-for="opt in transportOptions"
                    :key="opt.value"
                    :ref="(el) => setTransportBtnRef(opt.value, el)"
                    type="button"
                    @click="form.transport = opt.value"
                    :class="[
                      'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 outline-none cursor-pointer',
                      'transition-colors duration-200',
                      'focus-visible:ring-4 focus-visible:ring-coral/20',
                      'active:scale-95',
                      form.transport === opt.value
                        ? 'bg-coral text-white border-coral'
                        : 'bg-white text-navy border-navy/10 [@media(hover:hover)]:hover:border-coral/40 [@media(hover:hover)]:hover:bg-coral/5'
                    ]"
                  >
                    <component :is="opt.icon" :size="22" class="shrink-0" />
                    <span class="text-sm font-medium">{{ opt.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- ========== 第三组：个性偏好（选填） ========== -->
          <section class="relative pt-6">
            <!-- 分组分隔线（滚动到视口时从左到右绘制） -->
            <div class="form-separator absolute top-0 left-0 h-px w-full bg-navy/10 origin-left" />
            <PreferencePicker
              v-model="form.preferences"
              :error="errors.preferences"
              @blur="handleBlur('preferences')"
            />
          </section>

          <!-- ========== 提交按钮区 ========== -->
          <div class="relative pt-6 mt-2">
            <!-- 分组分隔线（滚动到视口时从左到右绘制） -->
            <div class="form-separator absolute top-0 left-0 h-px w-full bg-navy/5 origin-left" />
            <div class="flex justify-center mb-3">
              <BaseButton
                type="button"
                variant="ghost"
                size="sm"
                @click="fillExample"
              >
                一键填充示例
              </BaseButton>
            </div>
            <p class="text-center text-sm text-navy/50 mb-3">
              AI 将根据你的偏好生成个性化行程方案
            </p>
            <div ref="submitWrapRef" class="relative group">
              <BaseButton
                type="submit"
                size="lg"
                :loading="submitting"
                :disabled="!canSubmit"
                class="w-full active:scale-[0.98] [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-hover"
              >
                <Rocket v-if="!submitting" :size="18" class="shrink-0" />
                <span>{{ submitting ? '正在准备...' : '生成周末行程' }}</span>
              </BaseButton>
              <!-- 禁用时 hover tooltip -->
              <div
                v-if="!canSubmit"
                class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-navy text-white text-xs whitespace-nowrap z-10"
                role="tooltip"
              >
                请完善表单
              </div>
            </div>
            <p v-if="!canSubmit" class="text-center text-xs text-coral/70 mt-2">
              请先填写必填字段
            </p>
          </div>
        </form>
      </BaseCard>
    </div>
  </div>
</template>