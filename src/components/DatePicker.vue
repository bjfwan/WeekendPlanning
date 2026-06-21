<script setup lang="ts">
/** 自定义日历选择器组件，替代原生 <input type="date"> */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

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
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '请选择日期',
  required: false,
  error: ''
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

// 组件根元素引用，用于点击外部关闭
const rootRef = ref<HTMLElement | null>(null)
// 输入框引用
const inputRef = ref<HTMLElement | null>(null)

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
}

/** 切换到下一月 */
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else {
    viewMonth.value++
  }
}

/** 切换到上一年 */
function prevYear() {
  viewYear.value--
}

/** 切换到下一年 */
function nextYear() {
  viewYear.value++
}

/** 选择日期 */
function selectDate(date: Date) {
  if (isDisabled(date)) return
  emit('update:modelValue', formatDate(date))
  isOpen.value = false
}

/** 切换面板显示 */
function togglePanel() {
  isOpen.value = !isOpen.value
}

/** 处理点击外部关闭面板 */
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

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
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
        'focus:border-coral focus:ring-4 focus:ring-coral/15',
        error
          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
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

    <!-- 日历面板 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="isOpen"
        class="absolute z-50 mt-2 left-0 right-0 sm:left-auto sm:w-80 bg-cream rounded-2xl shadow-hover border border-navy/5 overflow-hidden"
      >
        <!-- 头部：年份/月份切换 -->
        <div class="px-3 py-3 bg-white border-b border-navy/5">
          <div class="flex items-center justify-between gap-1">
            <!-- 上一年 -->
            <button
              type="button"
              @click="prevYear"
              class="p-1.5 rounded-lg text-navy/50 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
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
              class="p-1.5 rounded-lg text-navy/60 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
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
              class="p-1.5 rounded-lg text-navy/60 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
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
              class="p-1.5 rounded-lg text-navy/50 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
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
        <div class="grid grid-cols-7 gap-0.5 px-2 pb-2 bg-cream">
          <button
            v-for="(cell, idx) in calendarDays"
            :key="idx"
            type="button"
            @click="selectDate(cell.date)"
            :disabled="isDisabled(cell.date)"
            :class="[
              'aspect-square flex items-center justify-center text-sm rounded-lg transition-all duration-150 cursor-pointer outline-none',
              'focus-visible:ring-2 focus-visible:ring-coral/40',
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
