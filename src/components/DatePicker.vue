<script setup lang="ts">
/** 自定义日历选择器组件，替代原生 <input type="date"> */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Component } from 'vue'
import { Pin, Sunrise, PartyPopper } from '@lucide/vue'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface QuickOption {
  /** 唯一标识，用于匹配图标（today/tomorrow/weekend） */
  key: string
  /** 按钮显示文字 */
  label: string
  /** 对应日期，YYYY-MM-DD 格式 */
  date: string
}

interface Props {
  /** 当前选中的日期，YYYY-MM-DD 格式 */
  modelValue?: string
  /** 最小可选日期，YYYY-MM-DD 格式 */
  min?: string
  /** 占位提示文字 */
  placeholder?: string
  /** 是否必填（用于显示 * 标记） */
  required?: boolean
  /** 错误信息 */
  error?: string
  /** 快捷日期选项，传入后在面板顶部渲染快捷按钮 */
  quickOptions?: QuickOption[]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '请选择日期',
  required: false,
  error: '',
  quickOptions: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// 面板显示状态
const isOpen = ref(false)
// 当前展示的年份
const viewYear = ref(new Date().getFullYear())
// 当前展示的月份（0-11）
const viewMonth = ref(new Date().getMonth())
// 是否移动端（<640px）
const isMobile = ref(false)

// GSAP 入口：context 统一管理动画并在卸载时自动清理
const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()
const ctx = context(() => {})

// 组件根元素引用，用于点击外部关闭
const rootRef = ref<HTMLElement | null>(null)
// 输入框引用
const inputRef = ref<HTMLElement | null>(null)
// 面板引用（用于下拉手势 + 面板入场动画）
const panelRef = ref<HTMLElement | null>(null)
// 日期网格容器引用（用于月份切换 stagger）
const gridRef = ref<HTMLElement | null>(null)
// 快捷按钮容器引用（用于选中弹性）
const quickContainerRef = ref<HTMLElement | null>(null)
// 选中弹性 timeline 引用（用于清理上一个动画）
let selectTl: ReturnType<typeof gsap.timeline> | null = null

/* ---------- 移动端下拉手势关闭 ---------- */
// 下拉偏移量（px），面板跟随手指移动
const dragOffset = ref(0)
// 是否正在拖拽
const isDragging = ref(false)
// 触摸起始 Y 坐标
let touchStartY = 0
// 触摸起始时的偏移量
let touchStartOffset = 0
// 下拉超过此阈值触发关闭
const DRAG_CLOSE_THRESHOLD = 100

/** 触摸开始：记录起始坐标 */
function onTouchStart(e: TouchEvent) {
  // 仅移动端面板顶部拖拽指示区响应
  if (!isMobile.value || !isOpen.value) return
  // 若触摸点在面板可滚动区域内部且未滚动到顶部，则不拦截（让用户正常滚动）
  if (panelRef.value && panelRef.value.scrollTop > 0) {
    // 仅当触摸目标在拖拽指示区时才启动手势
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle')) return
  }
  touchStartY = e.touches[0].clientY
  touchStartOffset = dragOffset.value
  isDragging.value = true
}

/** 触摸移动：面板跟随手指 */
function onTouchMove(e: TouchEvent) {
  if (!isDragging.value) return
  const currentY = e.touches[0].clientY
  const delta = currentY - touchStartY
  // 仅向下拉（delta > 0）时才偏移
  if (delta > 0) {
    dragOffset.value = touchStartOffset + delta
    // 阻止页面跟随滚动
    e.preventDefault()
  }
}

/** 触摸结束：超过阈值则关闭，否则回弹 */
function onTouchEnd() {
  if (!isDragging.value) return
  isDragging.value = false
  if (dragOffset.value > DRAG_CLOSE_THRESHOLD) {
    // 关闭面板
    isOpen.value = false
    dragOffset.value = 0
  } else {
    // 回弹到原位
    dragOffset.value = 0
  }
}

// 星期标题（周日开头）
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

// 月份名称
const monthNames = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
]

/** 格式化日期为 YYYY-MM-DD（使用本地时区） */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 解析 YYYY-MM-DD 字符串为 Date 对象（本地时区） */
function parseDate(str: string): Date | null {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  return new Date(year, month, day)
}

/** 获取今天日期对象（清零时分秒） */
function getTodayDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 当 modelValue 变化时，同步面板展示的年月
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      const d = parseDate(val)
      if (d) {
        viewYear.value = d.getFullYear()
        viewMonth.value = d.getMonth()
      }
    }
  }
)

// 打开面板时，初始化为选中日期或今天的年月
watch(isOpen, (open) => {
  if (open) {
    if (props.modelValue) {
      const d = parseDate(props.modelValue)
      if (d) {
        viewYear.value = d.getFullYear()
        viewMonth.value = d.getMonth()
      }
    } else {
      const today = getTodayDate()
      viewYear.value = today.getFullYear()
      viewMonth.value = today.getMonth()
    }
    // 面板入场动画（在 DOM 渲染后触发）
    nextTick(() => playPanelEnter())
  } else {
    // 关闭时重置拖拽偏移
    dragOffset.value = 0
    isDragging.value = false
  }
})

// 输入框显示文字
const displayText = computed(() => {
  if (!props.modelValue) return ''
  const d = parseDate(props.modelValue)
  if (!d) return props.modelValue
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
})

// 最小日期对象
const minDate = computed(() => (props.min ? parseDate(props.min) : null))

/**
 * 计算当前月份的日期网格（6 行 × 7 列）
 * 包含前后月份的填充日期，确保网格完整
 */
const calendarDays = computed(() => {
  const year = viewYear.value
  const month = viewMonth.value
  // 当月第一天
  const firstDay = new Date(year, month, 1)
  // 第一天是星期几（0 = 周日）
  const firstDayOfWeek = firstDay.getDay()
  // 网格起始日期（可能为上月末几天）
  const startDate = new Date(year, month, 1 - firstDayOfWeek)

  const days: { date: Date; currentMonth: boolean }[] = []
  // 共 42 天（6 周）
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    days.push({
      date: d,
      currentMonth: d.getMonth() === month
    })
  }
  return days
})

/** 是否为今天 */
function isToday(date: Date): boolean {
  const today = getTodayDate()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

/** 是否为选中日期 */
function isSelected(date: Date): boolean {
  if (!props.modelValue) return false
  const selected = parseDate(props.modelValue)
  if (!selected) return false
  return (
    date.getFullYear() === selected.getFullYear() &&
    date.getMonth() === selected.getMonth() &&
    date.getDate() === selected.getDate()
  )
}

/** 是否为禁用日期（早于最小日期） */
function isDisabled(date: Date): boolean {
  if (!minDate.value) return false
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime() < minDate.value.getTime()
}

/** 切换到上一月 */
function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value--
  } else {
    viewMonth.value--
  }
  playGridStagger()
}

/** 切换到下一月 */
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else {
    viewMonth.value++
  }
  playGridStagger()
}

/** 切换到上一年 */
function prevYear() {
  viewYear.value--
  playGridStagger()
}

/** 切换到下一年 */
function nextYear() {
  viewYear.value++
  playGridStagger()
}

/**
 * 日期网格 stagger 淡入
 * - 月份/年份切换时触发：gsap.from(cells, { stagger: 0.01, opacity: 0 })
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playGridStagger() {
  nextTick(() => {
    ctx.add(() => {
      if (prefersReducedMotion()) return
      const grid = gridRef.value
      if (!grid) return
      const cells = Array.from(grid.querySelectorAll<HTMLElement>('button'))
      if (cells.length === 0) return
      gsap.from(cells, {
        opacity: 0,
        stagger: 0.01,
        duration: 0.2,
        ease: EASE_OUT,
        clearProps: 'opacity'
      })
    })
  })
}

/**
 * 面板入场动画
 * - 桌面端：gsap.fromTo(y: -10, opacity: 0, scale: 0.98 → 1, EASE_BACK)
 * - 移动端：保持 CSS Transition（slide up），跳过 GSAP
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playPanelEnter() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = panelRef.value
    if (!el) return
    // 移动端使用 CSS Transition，不叠加 GSAP
    if (isMobile.value) return
    gsap.fromTo(
      el,
      { y: -10, opacity: 0, scale: 0.98 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.3,
        ease: EASE_BACK,
        clearProps: 'transform,opacity'
      }
    )
  })
}

/**
 * 日期选中弹性动画
 * - gsap.timeline() scale 1→1.2→1（EASE_BACK）+ 背景色过渡
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playDateSelectBounce(el: HTMLElement) {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    if (selectTl) {
      selectTl.kill()
      selectTl = null
    }
    selectTl = gsap.timeline({ onComplete: () => gsap.set(el, { clearProps: 'transform' }) })
      .to(el, { scale: 1.2, duration: 0.15, ease: EASE_OUT })
      .to(el, { scale: 1, duration: 0.2, ease: EASE_BACK })
  })
}

/**
 * 快捷按钮选中弹性过渡
 * - 选中态切换时弹性反馈
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playQuickOptionBounce(el: HTMLElement) {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    gsap.timeline({ onComplete: () => gsap.set(el, { clearProps: 'transform' }) })
      .to(el, { scale: 1.1, duration: 0.12, ease: EASE_OUT })
      .to(el, { scale: 1, duration: 0.2, ease: EASE_BACK })
  })
}

/** 选择日期（关闭面板） */
function selectDate(date: Date) {
  if (isDisabled(date)) return
  emit('update:modelValue', formatDate(date))
  // 触发选中弹性（在 DOM 更新后，选中态已渲染）
  nextTick(() => {
    if (gridRef.value) {
      const target = gridRef.value.querySelector<HTMLElement>('button.bg-coral')
      if (target) playDateSelectBounce(target)
    }
  })
  isOpen.value = false
}

/** 点击快捷选项：切换日历视图到对应月份并选中日期（不关闭面板） */
function selectQuickOption(opt: QuickOption) {
  const d = parseDate(opt.date)
  if (!d) return
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
  emit('update:modelValue', opt.date)
  // 月份切换 stagger 淡入
  playGridStagger()
  // 触发快捷按钮弹性
  if (quickContainerRef.value) {
    const buttons = Array.from(quickContainerRef.value.querySelectorAll<HTMLButtonElement>('button'))
    const idx = props.quickOptions.findIndex((o) => o.key === opt.key)
    if (idx >= 0 && buttons[idx]) playQuickOptionBounce(buttons[idx])
  }
}

/** 快捷选项是否处于选中态 */
function isQuickOptionActive(opt: QuickOption): boolean {
  return props.modelValue === opt.date
}

/** 根据 key 返回对应图标组件 */
function getQuickOptionIcon(key: string): Component | null {
  const k = key.toLowerCase()
  if (k.includes('today') || k.includes('今天')) return Pin
  if (k.includes('tomorrow') || k.includes('明天')) return Sunrise
  if (k.includes('weekend') || k.includes('周末')) return PartyPopper
  return null
}

/** 切换面板显示 */
function togglePanel() {
  isOpen.value = !isOpen.value
}

/** 处理点击外部关闭面板（桌面端） */
function handleClickOutside(e: MouseEvent) {
  if (!rootRef.value) return
  const target = e.target as Node
  if (!rootRef.value.contains(target)) {
    isOpen.value = false
  }
}

/** 处理键盘 ESC 关闭 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
}

/** 更新移动端状态 */
function updateIsMobile() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth < 640
}

// 面板过渡动画类名（桌面端 vs 移动端）
// 桌面端 enter 由 GSAP 处理（playPanelEnter），仅保留 leave 的 CSS 过渡
// 移动端保持 CSS Transition（slide up）
const transitionProps = computed(() => {
  if (isMobile.value) {
    return {
      enterActiveClass: 'transition duration-300 ease-out',
      enterFromClass: 'translate-y-full',
      enterToClass: 'translate-y-0',
      leaveActiveClass: 'transition duration-200 ease-in',
      leaveFromClass: 'translate-y-0',
      leaveToClass: 'translate-y-full'
    }
  }
  return {
    enterActiveClass: '',
    enterFromClass: '',
    enterToClass: '',
    leaveActiveClass: 'transition duration-150 ease-in',
    leaveFromClass: 'opacity-100 translate-y-0',
    leaveToClass: 'opacity-0 translate-y-2'
  }
})

// 面板容器类名（桌面端 vs 移动端）
// 移动端添加 safe-area-inset-bottom 适配 + grab 光标
const panelClasses = computed(() => {
  if (isMobile.value) {
    return 'fixed z-50 bottom-0 left-0 right-0 bg-cream rounded-t-2xl shadow-hover border-t border-navy/5 max-h-[60vh] overflow-y-auto cursor-grab active:cursor-grabbing'
  }
  return 'absolute z-50 mt-2 left-0 right-0 sm:left-auto sm:w-80 bg-cream rounded-2xl shadow-hover border border-navy/5 overflow-hidden'
})

// 面板内联样式：移动端下拉时跟随手指 + 安全区底部留白
const panelStyle = computed(() => {
  if (!isMobile.value) return {}
  const style: Record<string, string> = {
    paddingBottom: 'env(safe-area-inset-bottom)'
  }
  if (dragOffset.value > 0) {
    style.transform = `translateY(${dragOffset.value}px)`
    // 拖拽时移除过渡，让面板实时跟随手指
    style.transition = 'none'
  }
  return style
})

onMounted(() => {
  updateIsMobile()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateIsMobile)
})
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <!-- 触发输入框 -->
    <div
      ref="inputRef"
      role="button"
      tabindex="0"
      @click="togglePanel"
      @keydown.enter.prevent="togglePanel"
      @keydown.space.prevent="togglePanel"
      :class="[
        'w-full px-4 py-3 rounded-xl bg-white border-2 transition-all duration-200 outline-none cursor-pointer',
        'flex items-center justify-between gap-2',
        'focus-visible:border-coral focus-visible:ring-4 focus-visible:ring-coral/20',
        error
          ? 'border-red-400 focus-visible:border-red-400'
          : 'border-navy/10 hover:border-navy/20',
        isOpen && !error && 'border-coral ring-4 ring-coral/15'
      ]"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <!-- 日历图标 -->
        <svg
          class="w-5 h-5 flex-shrink-0"
          :class="modelValue ? 'text-coral' : 'text-navy/40'"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span
          v-if="modelValue"
          class="text-navy font-medium truncate"
        >
          {{ displayText }}
        </span>
        <span v-else class="text-navy/30">{{ placeholder }}</span>
      </div>
      <!-- 下拉箭头 -->
      <svg
        class="w-4 h-4 flex-shrink-0 text-navy/40 transition-transform duration-200"
        :class="isOpen && 'rotate-180'"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>

    <!-- 错误提示 -->
    <p v-if="error" class="mt-1.5 text-sm text-red-500">{{ error }}</p>

    <!-- 移动端遮罩 -->
    <Transition
      enter-active-class="transition duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen && isMobile"
        class="fixed inset-0 z-40 bg-black/40"
        @click="togglePanel"
      />
    </Transition>

    <!-- 日历面板 -->
    <Transition
      v-bind="transitionProps"
    >
      <div
        v-if="isOpen"
        ref="panelRef"
        :class="panelClasses"
        :style="panelStyle"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend.passive="onTouchEnd"
        @touchcancel.passive="onTouchEnd"
      >
        <!-- 移动端拖拽指示条（drag-handle 标识手势触发区） -->
        <div
          v-if="isMobile"
          class="drag-handle flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
        >
          <div class="w-10 h-1 rounded-full bg-navy/20" />
        </div>

        <!-- 快捷按钮区 -->
        <div
          v-if="quickOptions && quickOptions.length > 0"
          ref="quickContainerRef"
          class="flex gap-2 px-3 pt-3 pb-2 bg-white border-b border-navy/5 overflow-x-auto"
        >
          <button
            v-for="opt in quickOptions"
            :key="opt.key"
            type="button"
            @click="selectQuickOption(opt)"
            :class="[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm min-h-[40px] border-2 transition-all duration-200 cursor-pointer outline-none whitespace-nowrap',
              'focus-visible:ring-4 focus-visible:ring-coral/20',
              isQuickOptionActive(opt)
                ? 'bg-coral text-white border-coral'
                : 'bg-white text-navy/70 border-navy/10 hover:border-coral/40'
            ]"
          >
            <component
              v-if="getQuickOptionIcon(opt.key)"
              :is="getQuickOptionIcon(opt.key)"
              class="w-4 h-4 flex-shrink-0"
            />
            {{ opt.label }}
          </button>
        </div>

        <!-- 头部：年份/月份切换 -->
        <div class="px-3 py-3 bg-white border-b border-navy/5">
          <div class="flex items-center justify-between gap-1">
            <!-- 上一年 -->
            <button
              type="button"
              @click="prevYear"
              class="flex items-center justify-center min-w-[40px] min-h-[40px] p-1.5 rounded-lg text-navy/50 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
              aria-label="上一年"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <!-- 上一月 -->
            <button
              type="button"
              @click="prevMonth"
              class="flex items-center justify-center min-w-[40px] min-h-[40px] p-1.5 rounded-lg text-navy/60 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
              aria-label="上一月"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <!-- 当前年月显示 -->
            <div class="flex-1 text-center">
              <div class="text-sm font-bold text-navy">
                {{ viewYear }}年{{ monthNames[viewMonth] }}
              </div>
            </div>
            <!-- 下一月 -->
            <button
              type="button"
              @click="nextMonth"
              class="flex items-center justify-center min-w-[40px] min-h-[40px] p-1.5 rounded-lg text-navy/60 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
              aria-label="下一月"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <!-- 下一年 -->
            <button
              type="button"
              @click="nextYear"
              class="flex items-center justify-center min-w-[40px] min-h-[40px] p-1.5 rounded-lg text-navy/50 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
              aria-label="下一年"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7m-8-14l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 星期标题 -->
        <div class="grid grid-cols-7 gap-0.5 px-2 pt-2 pb-1 bg-cream">
          <div
            v-for="(day, idx) in weekDays"
            :key="day"
            class="h-8 flex items-center justify-center text-xs font-semibold"
            :class="idx === 0 || idx === 6 ? 'text-coral/70' : 'text-navy/50'"
          >
            {{ day }}
          </div>
        </div>

        <!-- 日期网格 -->
        <div ref="gridRef" class="grid grid-cols-7 gap-0.5 px-2 pb-2 bg-cream">
          <button
            v-for="(cell, idx) in calendarDays"
            :key="idx"
            type="button"
            @click="selectDate(cell.date)"
            :disabled="isDisabled(cell.date)"
            :class="[
              'flex items-center justify-center text-sm rounded-lg transition-all duration-150 cursor-pointer outline-none min-h-[44px] sm:min-h-0 sm:aspect-square',
              'focus-visible:ring-4 focus-visible:ring-coral/20',
              // 禁用日期
              isDisabled(cell.date)
                ? 'text-navy/20 cursor-not-allowed hover:bg-transparent'
                : // 选中日期
                  isSelected(cell.date)
                  ? 'bg-coral text-cream font-bold shadow-md scale-105 hover:bg-coral-dark'
                  : // 非当月日期
                    !cell.currentMonth
                    ? 'text-navy/25 hover:bg-navy/5'
                    : // 今天
                      isToday(cell.date)
                      ? 'border-2 border-coral text-coral font-semibold hover:bg-coral/10'
                      : 'text-navy hover:bg-coral/10 hover:text-coral'
            ]"
          >
            {{ cell.date.getDate() }}
          </button>
        </div>

        <!-- 底部：今天快捷按钮 -->
        <div class="px-3 py-2 bg-white border-t border-navy/5 flex justify-end">
          <button
            type="button"
            @click="selectDate(getTodayDate())"
            :disabled="minDate ? getTodayDate().getTime() < minDate.getTime() : false"
            class="text-xs font-medium text-coral hover:text-coral-dark transition-colors px-2 py-1 rounded-md hover:bg-coral/5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            回到今天
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
