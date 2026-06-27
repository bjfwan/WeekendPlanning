<script setup lang="ts">
/** 城市自动完成输入框，支持拼音/首字母匹配与键盘导航 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { MapPin, X, AlertCircle } from '@lucide/vue'
import { CHINA_CITIES, type City } from '../../data/cities'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  /** 当前城市名 */
  modelValue: string
  /** 占位提示文字 */
  placeholder?: string
  /** 错误信息 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '例如：杭州',
  error: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'blur': []
}>()

// 输入框当前文字
const inputValue = ref(props.modelValue)
// 是否展开下拉面板（桌面端）
const isOpen = ref(false)
// 当前高亮项索引（-1 表示无高亮）
const activeIndex = ref(-1)
// 输入框是否聚焦
const isFocused = ref(false)
// 防抖后的查询字符串
const query = ref('')

// GSAP 入口：context 统一管理动画并在卸载时自动清理
const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()
const ctx = context(() => {})

// 是否移动端（<640px）：移动端聚焦时切换为全屏 modal
const isMobile = ref(false)
// 移动端 modal 是否打开
const showMobileModal = ref(false)

// 防抖定时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 选中后面板收起延迟定时器
let closeTimer: ReturnType<typeof setTimeout> | null = null

// 输入框引用（桌面端）
const inputRef = ref<HTMLInputElement | null>(null)
// 移动端 modal 内的输入框引用
const modalInputRef = ref<HTMLInputElement | null>(null)
// 组件根元素引用
const rootRef = ref<HTMLElement | null>(null)
// 下拉面板引用
const panelRef = ref<HTMLElement | null>(null)
// 桌面端高亮竖条引用（单个元素，通过 gsap.to 移动 y 位置）
const desktopIndicatorRef = ref<HTMLElement | null>(null)
// 移动端高亮竖条引用
const mobileIndicatorRef = ref<HTMLElement | null>(null)
// 选中弹性 timeline 引用（用于快速选中时清理上一个动画）
let selectTl: ReturnType<typeof gsap.timeline> | null = null
// 竖条移动 tween 引用（用于清理上一个移动动画）
let indicatorTween: ReturnType<typeof gsap.to> | null = null

// 同步外部 modelValue 变化
watch(
  () => props.modelValue,
  (val) => {
    if (val !== inputValue.value) {
      inputValue.value = val
      query.value = val
    }
  }
)

/**
 * 过滤匹配城市
 * 匹配规则：城市名包含 / 全拼开头 / 拼音首字母开头
 */
const filteredCities = computed<City[]>(() => {
  const raw = query.value.trim()
  if (!raw) return []
  const q = raw.toLowerCase()
  return CHINA_CITIES.filter((city) => {
    if (city.name.includes(raw)) return true
    if (city.pinyin.toLowerCase().startsWith(q)) return true
    if (city.pinyinShort.toLowerCase().startsWith(q)) return true
    return false
  }).slice(0, 20)
})

// 是否显示"未找到"提示
const showNoMatch = computed(() => {
  return isOpen.value && query.value.trim().length > 0 && filteredCities.value.length === 0
})

// 搜索结果播报文案（供 aria-live 区域读取）
// 有结果："找到 N 个匹配城市"，无结果："未找到匹配城市"
const resultAnnouncement = computed(() => {
  const raw = query.value.trim()
  if (!raw) return ''
  // 桌面端 isOpen 或移动端 showMobileModal 时才播报
  if (!isOpen.value && !showMobileModal.value) return ''
  const count = filteredCities.value.length
  if (count > 0) return `找到 ${count} 个匹配城市`
  return '未找到匹配城市'
})

// 下拉项变化时触发 stagger 入场 + 同步高亮竖条位置
// - 监听 filteredCities：每次搜索结果变化重新入场
// - 监听 activeIndex：高亮变化时移动竖条
watch(
  filteredCities,
  () => {
    if (!isOpen.value && !showMobileModal.value) return
    nextTick(() => {
      playItemsEnter(panelRef.value)
      // 初始高亮项（activeIndex = 0）时同步竖条位置
      if (activeIndex.value >= 0) {
        moveIndicatorTo(activeIndex.value)
      }
    })
  }
)

watch(activeIndex, (idx) => {
  if (!isOpen.value && !showMobileModal.value) return
  moveIndicatorTo(idx)
})

/** 获取城市名中需要高亮的片段 */
function getHighlightParts(name: string): { text: string; highlight: boolean }[] {
  const q = query.value.trim()
  if (!q) return [{ text: name, highlight: false }]
  const idx = name.indexOf(q)
  if (idx === -1) return [{ text: name, highlight: false }]
  const parts: { text: string; highlight: boolean }[] = []
  if (idx > 0) parts.push({ text: name.slice(0, idx), highlight: false })
  parts.push({ text: q, highlight: true })
  const tail = name.slice(idx + q.length)
  if (tail) parts.push({ text: tail, highlight: false })
  return parts
}

/** 处理输入事件（带 300ms 防抖） */
function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  inputValue.value = val
  emit('update:modelValue', val)

  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    query.value = val
    if (val.trim()) {
      isOpen.value = true
      activeIndex.value = filteredCities.value.length > 0 ? 0 : -1
    } else {
      isOpen.value = false
      activeIndex.value = -1
    }
  }, 300)
}

/** 选中某个城市 */
function selectCity(city: City) {
  inputValue.value = city.name
  emit('update:modelValue', city.name)
  query.value = city.name
  activeIndex.value = -1

  // 面板收起（150ms 延迟，让 leave 动画播放）
  closeTimer = setTimeout(() => {
    isOpen.value = false
    closeTimer = null
  }, 150)

  // 移动端 modal 关闭
  if (showMobileModal.value) {
    closeMobileModal()
  }

  // 输入框文字弹性回弹：scale 1→0.95→1.05→1（EASE_BACK）
  playSelectBounce()
}

/**
 * 选中弹性回弹动画
 * - 用 gsap.timeline() 替代原 justSelected scale 0.98→1 100ms
 * - scale 1→0.95→1.05→1，EASE_BACK
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playSelectBounce() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = inputRef.value
    if (!el) return
    // 清理上一个 timeline，避免快速连续选中时动画堆积
    if (selectTl) {
      selectTl.kill()
      selectTl = null
    }
    selectTl = gsap.timeline({ onComplete: () => gsap.set(el, { clearProps: 'transform' }) })
      .to(el, { scale: 0.95, duration: 0.08, ease: EASE_OUT })
      .to(el, { scale: 1.05, duration: 0.12, ease: EASE_BACK })
      .to(el, { scale: 1, duration: 0.12, ease: EASE_BACK })
  })
}

/**
 * 下拉项 stagger 入场
 * - 下拉打开时触发：gsap.from(items, { stagger: 0.03, y: -8, opacity: 0, EASE_OUT })
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playItemsEnter(panel: HTMLElement | null) {
  if (!panel) return
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const items = Array.from(panel.querySelectorAll<HTMLElement>('[data-idx]'))
    if (items.length === 0) return
    gsap.from(items, {
      y: -8,
      opacity: 0,
      stagger: 0.03,
      duration: 0.25,
      ease: EASE_OUT,
      clearProps: 'transform,opacity'
    })
  })
}

/**
 * 高亮竖条平滑移动
 * - 单个竖条元素，根据 activeIndex 计算目标 y 位置
 * - 用 gsap.to 移动 y，EASE_OUT
 * - 尊重 prefers-reduced-motion（直接 set）
 */
function moveIndicatorTo(index: number) {
  const indicator = isMobile.value ? mobileIndicatorRef.value : desktopIndicatorRef.value
  const panel = panelRef.value
  if (!indicator || !panel) return
  if (index < 0) {
    // 无高亮：隐藏竖条
    gsap.set(indicator, { opacity: 0 })
    return
  }
  const target = panel.querySelector<HTMLElement>(`[data-idx="${index}"]`)
  if (!target) return
  ctx.add(() => {
    if (prefersReducedMotion()) {
      gsap.set(indicator, { y: target.offsetTop + target.offsetHeight / 2 - 12, opacity: 1 })
      return
    }
    // 显示竖条
    gsap.set(indicator, { opacity: 1 })
    // 清理上一个移动 tween
    if (indicatorTween) {
      indicatorTween.kill()
      indicatorTween = null
    }
    // 计算目标 y：竖条高度 24px（h-6），居中对齐到选项中心
    const targetY = target.offsetTop + target.offsetHeight / 2 - 12
    indicatorTween = gsap.to(indicator, {
      y: targetY,
      duration: 0.2,
      ease: EASE_OUT
    })
  })
}

/** 立即关闭面板 */
function closePanel() {
  isOpen.value = false
  activeIndex.value = -1
}

/** 滚动高亮项到可视区域 */
function scrollActiveIntoView() {
  nextTick(() => {
    if (!panelRef.value) return
    const el = panelRef.value.querySelector(`[data-idx="${activeIndex.value}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
    // 同步移动高亮竖条
    moveIndicatorTo(activeIndex.value)
  })
}

/** 键盘导航 */
function onKeydown(e: KeyboardEvent) {
  // 面板未展开时，↓ 可以打开面板
  if (!isOpen.value) {
    if (e.key === 'ArrowDown' && filteredCities.value.length > 0) {
      e.preventDefault()
      isOpen.value = true
      activeIndex.value = 0
      scrollActiveIntoView()
    }
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (filteredCities.value.length === 0) break
      activeIndex.value = Math.min(activeIndex.value + 1, filteredCities.value.length - 1)
      scrollActiveIntoView()
      break
    case 'ArrowUp':
      e.preventDefault()
      if (filteredCities.value.length === 0) break
      activeIndex.value = Math.max(activeIndex.value - 1, 0)
      scrollActiveIntoView()
      break
    case 'Enter':
      e.preventDefault()
      if (activeIndex.value >= 0 && activeIndex.value < filteredCities.value.length) {
        selectCity(filteredCities.value[activeIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      closePanel()
      nextTick(() => inputRef.value?.focus())
      break
    case 'Tab':
      // 选中第一个匹配项并跳到下一字段
      if (filteredCities.value.length > 0) {
        selectCity(filteredCities.value[0])
      }
      break
  }
}

/** 输入框聚焦 */
function onFocus() {
  isFocused.value = true
  // 移动端：聚焦时打开全屏 modal
  if (isMobile.value) {
    openMobileModal()
    return
  }
  // 桌面端：展开下拉
  if (inputValue.value.trim() && filteredCities.value.length > 0) {
    isOpen.value = true
    activeIndex.value = 0
  }
}

/** 输入框失焦 */
function onBlur() {
  isFocused.value = false
  emit('blur')
}

/** 点击外部关闭 */
function handleClickOutside(e: MouseEvent) {
  if (!rootRef.value) return
  const target = e.target as Node
  if (!rootRef.value.contains(target)) {
    closePanel()
  }
}

/** 选项 id（用于 aria-activedescendant） */
function optionId(index: number): string {
  return `city-opt-${index}`
}

/* ---------- 移动端全屏 modal ---------- */

/** 打开移动端 modal：同步查询并聚焦 modal 内输入框 */
function openMobileModal() {
  showMobileModal.value = true
  // 同步当前输入值到查询，展示已有结果
  query.value = inputValue.value
  if (inputValue.value.trim()) {
    isOpen.value = true
    activeIndex.value = filteredCities.value.length > 0 ? 0 : -1
  }
  // 聚焦 modal 内的输入框
  nextTick(() => {
    modalInputRef.value?.focus()
    // 选中已有文字，方便重新输入
    modalInputRef.value?.select()
  })
}

/** 关闭移动端 modal */
function closeMobileModal() {
  showMobileModal.value = false
  // 关闭下拉
  isOpen.value = false
  activeIndex.value = -1
}

/** 更新移动端状态 */
function updateIsMobile() {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth < 640
  // 从移动端切换到桌面端时，关闭可能打开的 modal
  if (!isMobile.value && showMobileModal.value) {
    closeMobileModal()
  }
}

onMounted(() => {
  updateIsMobile()
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', updateIsMobile)
  if (debounceTimer) clearTimeout(debounceTimer)
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <!-- 搜索结果播报（屏幕阅读器专用） -->
    <div role="status" aria-live="polite" class="sr-only">{{ resultAnnouncement }}</div>

    <!-- 输入框容器 -->
    <div
      :class="[
        'relative flex items-center w-full px-4 py-3 rounded-xl bg-white border-2 transition-all duration-200',
        'focus-within:ring-4 focus-within:ring-coral/20',
        error
          ? 'border-coral focus-within:border-coral'
          : isOpen
            ? 'border-coral'
            : 'border-navy/10 hover:border-navy/20'
      ]"
    >
      <!-- 前缀图标 MapPin -->
      <MapPin
        class="w-5 h-5 flex-shrink-0 mr-2.5 transition-all duration-200"
        :class="[
          isFocused ? 'text-coral scale-110' : 'text-navy/40'
        ]"
      />
      <!-- 输入框 -->
      <input
        ref="inputRef"
        type="text"
        :value="inputValue"
        :placeholder="placeholder"
        aria-label="目的地城市"
        role="combobox"
        :aria-expanded="isOpen"
        :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
        aria-autocomplete="list"
        aria-controls="city-listbox"
        @input="onInput"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
        class="flex-1 min-w-0 bg-transparent border-none outline-none text-navy placeholder:text-navy/30 origin-left"
      />
      <!-- 下拉箭头 -->
      <svg
        class="w-4 h-4 flex-shrink-0 ml-2 text-navy/40 transition-transform duration-200"
        :class="isOpen && 'rotate-180'"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
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
    <Transition
      enter-active-class="transition-all duration-[150ms] ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-[100ms] ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0"
    >
      <p
        v-if="error"
        class="mt-2 text-coral text-sm flex items-center gap-1 min-w-0"
        aria-live="polite"
      >
        <AlertCircle :size="16" class="shrink-0" />
        <span class="truncate">{{ error }}</span>
      </p>
    </Transition>

    <!-- 桌面端下拉面板 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="isOpen && !isMobile"
        id="city-listbox"
        ref="panelRef"
        role="listbox"
        class="absolute z-50 mt-2 left-0 right-0 bg-white rounded-xl shadow-lg border border-navy/5 max-h-60 overflow-y-auto"
      >
        <!-- 单个高亮竖条（通过 gsap.to 移动 y 位置） -->
        <span
          ref="desktopIndicatorRef"
          class="pointer-events-none absolute left-0 top-0 w-0.5 h-6 bg-coral rounded-r"
          style="opacity: 0; will-change: transform, opacity;"
          aria-hidden="true"
        />
        <!-- 匹配项列表 -->
        <ul class="py-1">
          <li
            v-for="(city, idx) in filteredCities"
            :key="`${city.name}-${idx}`"
            :id="optionId(idx)"
            :data-idx="idx"
            role="option"
            :aria-selected="idx === activeIndex"
            @click="selectCity(city)"
            @mousedown.prevent
            @mouseenter="activeIndex = idx"
            :class="[
              'relative flex items-center justify-between gap-3 py-3 px-4 min-h-[44px] cursor-pointer transition-colors duration-150',
              idx === activeIndex ? 'bg-coral/5' : 'bg-transparent'
            ]"
          >
            <!-- 城市名 + 省份 -->
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-navy font-medium truncate">
                <template v-for="(part, pIdx) in getHighlightParts(city.name)" :key="pIdx">
                  <mark v-if="part.highlight" class="bg-amber/30 text-navy rounded px-0.5">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
              <span class="text-navy/40 text-sm flex-shrink-0">{{ city.province }}</span>
            </div>
            <!-- 拼音首字母 -->
            <span class="text-navy/30 text-xs font-mono flex-shrink-0 uppercase">{{ city.pinyinShort }}</span>
          </li>
        </ul>

        <!-- 无匹配提示 -->
        <div v-if="showNoMatch" class="py-4 px-4 text-center">
          <p class="text-sm text-navy/50">
            未找到"<span class="text-coral font-medium">{{ query.trim() }}</span>"，将使用自定义城市
          </p>
        </div>
      </div>
    </Transition>

    <!-- 移动端全屏 modal -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showMobileModal"
        class="fixed inset-0 z-50 bg-white flex flex-col"
        style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);"
      >
        <!-- modal 顶部：标题 + 关闭按钮 -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-navy/5">
          <h2 class="text-base font-bold text-navy">选择城市</h2>
          <button
            type="button"
            @click="closeMobileModal"
            class="flex items-center justify-center w-9 h-9 -mr-2 rounded-full text-navy/60 hover:text-coral hover:bg-coral/5 transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- 搜索框（固定在顶部） -->
        <div class="px-4 py-3 border-b border-navy/5 bg-white">
          <div
            :class="[
              'flex items-center w-full px-4 py-3 rounded-xl bg-cream border-2 transition-all duration-200',
              'focus-within:ring-4 focus-within:ring-coral/20',
              isOpen ? 'border-coral' : 'border-navy/10'
            ]"
          >
            <MapPin
              class="w-5 h-5 flex-shrink-0 mr-2.5 text-coral"
            />
            <input
              ref="modalInputRef"
              type="text"
              :value="inputValue"
              placeholder="搜索城市名或拼音"
              aria-label="搜索城市"
              role="combobox"
              :aria-expanded="isOpen"
              :aria-activedescendant="activeIndex >= 0 ? optionId(activeIndex) : undefined"
              aria-autocomplete="list"
              aria-controls="city-listbox-mobile"
              @input="onInput"
              @keydown="onKeydown"
              class="flex-1 min-w-0 bg-transparent border-none outline-none text-navy placeholder:text-navy/30"
            />
          </div>
        </div>

        <!-- 结果列表（占满剩余空间） -->
        <div
          v-if="isOpen"
          id="city-listbox-mobile"
          ref="panelRef"
          role="listbox"
          class="relative flex-1 overflow-y-auto"
        >
          <!-- 单个高亮竖条（通过 gsap.to 移动 y 位置） -->
          <span
            ref="mobileIndicatorRef"
            class="pointer-events-none absolute left-0 top-0 w-0.5 h-6 bg-coral rounded-r"
            style="opacity: 0; will-change: transform, opacity;"
            aria-hidden="true"
          />
          <ul class="py-1">
            <li
              v-for="(city, idx) in filteredCities"
              :key="`${city.name}-${idx}-m`"
              :id="optionId(idx)"
              :data-idx="idx"
              role="option"
              :aria-selected="idx === activeIndex"
              @click="selectCity(city)"
              @mousedown.prevent
              @touchstart="activeIndex = idx"
              :class="[
                'relative flex items-center justify-between gap-3 py-3 px-4 min-h-[48px] cursor-pointer transition-colors duration-150',
                idx === activeIndex ? 'bg-coral/5' : 'bg-transparent'
              ]"
            >
              <!-- 城市名 + 省份 -->
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="text-navy font-medium truncate">
                  <template v-for="(part, pIdx) in getHighlightParts(city.name)" :key="pIdx">
                    <mark v-if="part.highlight" class="bg-amber/30 text-navy rounded px-0.5">{{ part.text }}</mark>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <span class="text-navy/40 text-sm flex-shrink-0">{{ city.province }}</span>
              </div>
              <!-- 拼音首字母 -->
              <span class="text-navy/30 text-xs font-mono flex-shrink-0 uppercase">{{ city.pinyinShort }}</span>
            </li>
          </ul>

          <!-- 无匹配提示 -->
          <div v-if="showNoMatch" class="py-8 px-4 text-center">
            <p class="text-sm text-navy/50">
              未找到"<span class="text-coral font-medium">{{ query.trim() }}</span>"，将使用自定义城市
            </p>
          </div>
        </div>

        <!-- 空状态提示（未输入时） -->
        <div v-else class="flex-1 flex items-center justify-center px-4">
          <p class="text-sm text-navy/40">输入城市名、拼音或首字母搜索</p>
        </div>
      </div>
    </Transition>
  </div>
</template>
