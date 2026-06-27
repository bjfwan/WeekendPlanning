<script setup lang="ts">
/**
 * 统一偏好选择器（合并心情+兴趣）
 * 支持多选 + 限制最多选 N 个，通过 v-model 双向绑定
 */
import { computed, ref, onBeforeUnmount } from 'vue'
import { AlertCircle } from '@lucide/vue'
import BaseTag from '@/components/BaseTag.vue'
import { useHapticFeedback } from '@/composables/useHapticFeedback'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'
import {
  PREFERENCE_OPTIONS,
  PREFERENCE_MAX,
  type PreferenceOption
} from '@/data/preferences'

interface Props {
  modelValue: string[]
  options?: PreferenceOption[]
  max?: number
  label?: string
  /** 错误信息 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  options: () => PREFERENCE_OPTIONS,
  max: PREFERENCE_MAX,
  label: '个性偏好',
  error: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  'reach-limit': []
  'blur': []
}>()

const { trigger: triggerHaptic } = useHapticFeedback()

// GSAP 入口：context 统一管理动画并在卸载时自动清理
const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()
const ctx = context(() => {})

// 标签容器引用（用于查找标签元素 + 抖动动画）
const tagsContainerRef = ref<HTMLElement | null>(null)
// 抖动 timeline 引用（用于清理上一个抖动）
let shakeTl: ReturnType<typeof gsap.timeline> | null = null

// 组件卸载时清理抖动 timeline
onBeforeUnmount(() => {
  if (shakeTl) {
    shakeTl.kill()
    shakeTl = null
  }
})

const selectedCount = computed(() => props.modelValue.length)
const isAtLimit = computed(() => selectedCount.value >= props.max)
const isNearLimit = computed(
  () => selectedCount.value >= props.max - 1 && !isAtLimit.value
)

// 选中状态播报文案（供 aria-live 区域读取）
// 选中/取消时："已选 N 项，最多 5 项"，达到上限时："已达到上限"
const selectionAnnouncement = ref('')
let announceTimer: ReturnType<typeof setTimeout> | null = null

/** 更新播报文案（防抖避免快速切换时刷屏） */
function updateAnnouncement() {
  if (announceTimer) clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    if (isAtLimit.value) {
      selectionAnnouncement.value = '已达到上限'
    } else {
      selectionAnnouncement.value = `已选 ${selectedCount.value} 项，最多 ${props.max} 项`
    }
  }, 150)
}

/** 按 category 分组：先 mood 后 interest */
const sections = computed(() => {
  const mood = props.options.filter((o) => o.category === 'mood')
  const interest = props.options.filter((o) => o.category === 'interest')
  return [
    { title: '心情状态', options: mood },
    { title: '兴趣领域', options: interest }
  ].filter((s) => s.options.length > 0)
})

function isSelected(label: string): boolean {
  return props.modelValue.includes(label)
}

function isDisabled(label: string): boolean {
  return isAtLimit.value && !isSelected(label)
}

function toggle(label: string) {
  const idx = props.modelValue.indexOf(label)
  if (idx >= 0) {
    // 已选中 → 取消
    const next = [...props.modelValue]
    next.splice(idx, 1)
    emit('update:modelValue', next)
    // 轻触觉反馈
    triggerHaptic('light')
    updateAnnouncement()
    // 选中弹性脉冲反馈
    playSelectPulse(label)
  } else {
    // 未选中 → 检查上限
    if (isAtLimit.value) {
      // 达到上限：触觉反馈提示
      triggerHaptic('medium')
      emit('reach-limit')
      selectionAnnouncement.value = '已达到上限'
      if (announceTimer) clearTimeout(announceTimer)
      // 未选标签轻微抖动
      playLimitShake()
      return
    }
    const next = [...props.modelValue, label]
    emit('update:modelValue', next)
    // 轻触觉反馈
    triggerHaptic('light')
    // 选中弹性脉冲反馈
    playSelectPulse(label)
    if (next.length >= props.max) {
      // 选中后达到上限：立即播报"已达到上限"
      selectionAnnouncement.value = '已达到上限'
      if (announceTimer) clearTimeout(announceTimer)
      emit('reach-limit')
    } else {
      updateAnnouncement()
    }
  }
}

/**
 * 选中弹性脉冲反馈
 * - 与 BaseTag 配合，在 PreferencePicker 内对选中项 wrapper 做额外脉冲
 * - gsap.timeline() scale 1→1.08→1（EASE_BACK）
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playSelectPulse(label: string) {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const container = tagsContainerRef.value
    if (!container) return
    const el = container.querySelector<HTMLElement>(`[data-label="${label}"]`)
    if (!el) return
    gsap.timeline({ onComplete: () => gsap.set(el, { clearProps: 'transform' }) })
      .to(el, { scale: 1.08, duration: 0.12, ease: EASE_OUT })
      .to(el, { scale: 1, duration: 0.22, ease: EASE_BACK })
  })
}

/**
 * 达到上限抖动
 * - 未选标签轻微抖动（gsap.to x: ±5, repeat: 3）
 * - 尊重 prefers-reduced-motion（跳过动画）
 */
function playLimitShake() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const container = tagsContainerRef.value
    if (!container) return
    // 找到所有未选中的标签 wrapper（带 data-disabled 标识）
    const unselected = Array.from(container.querySelectorAll<HTMLElement>('[data-disabled="true"]'))
    if (unselected.length === 0) return
    // 清理上一个抖动 timeline
    if (shakeTl) {
      shakeTl.kill()
      shakeTl = null
    }
    const tl = gsap.timeline({
      onComplete: () => {
        unselected.forEach((el) => gsap.set(el, { clearProps: 'transform' }))
      }
    })
    shakeTl = tl
    unselected.forEach((el) => {
      tl.to(
        el,
        {
          x: 5,
          duration: 0.05,
          ease: 'power1.inOut',
          yoyo: true,
          repeat: 3
        },
        0
      )
    })
  })
}

/** 容器失焦（使用 focusout 冒泡捕获） */
function onBlur() {
  emit('blur')
}
</script>

<template>
  <div
    role="group"
    aria-label="个性偏好"
    tabindex="-1"
    @focusout="onBlur"
    class="bg-cream/30 rounded-xl p-5 outline-none"
  >
    <!-- 选中状态播报（屏幕阅读器专用） -->
    <div role="status" aria-live="polite" class="sr-only">{{ selectionAnnouncement }}</div>

    <!-- 组标题 + 选填徽标 + 计数 -->
    <div class="flex items-center mb-4">
      <div class="w-1 h-5 bg-coral rounded-full mr-2" />
      <h3 class="text-sm font-medium text-navy/60">{{ label }}</h3>
      <span
        class="ml-2 text-xs px-2 py-0.5 rounded-full bg-navy/5 text-navy/50"
      >
        选填
      </span>
      <span
        class="ml-auto text-xs transition-colors duration-normal"
        :class="[
          isAtLimit
            ? 'text-coral font-semibold'
            : isNearLimit
              ? 'text-amber-dark'
              : 'text-navy/40'
        ]"
        aria-live="polite"
      >
        已选 {{ selectedCount }}/{{ max }}
      </span>
    </div>

    <!-- 分组渲染：心情状态 / 兴趣领域（桌面端双列） -->
    <div ref="tagsContainerRef" class="grid sm:grid-cols-2 gap-x-6 gap-y-4">
      <div
        v-for="section in sections"
        :key="section.title"
      >
        <!-- 子标题 -->
        <div class="flex items-center mb-2 pl-2">
          <div class="w-0.5 h-4 bg-coral/30 rounded-full mr-2" />
          <h4
            class="text-xs font-semibold text-navy/50 uppercase tracking-wide"
          >
            {{ section.title }}
          </h4>
        </div>
        <!-- 标签列表（v-stagger 按分组 stagger 入场） -->
        <div v-stagger="{ y: 16, stagger: 0.04, duration: 0.4 }" class="flex flex-wrap gap-2">
          <div
            v-for="opt in section.options"
            :key="opt.label"
            :data-label="opt.label"
            :data-disabled="isDisabled(opt.label) ? 'true' : undefined"
            class="group relative"
          >
            <BaseTag
              :selected="isSelected(opt.label)"
              :emoji="opt.emoji"
              :icon="opt.icon"
              role="checkbox"
              :aria-checked="isSelected(opt.label) ? 'true' : 'false'"
              :aria-disabled="isDisabled(opt.label) ? 'true' : undefined"
              :class="[
                isDisabled(opt.label)
                  ? 'opacity-50 cursor-not-allowed pointer-events-none transition-all duration-slow'
                  : ''
              ]"
              @click="toggle(opt.label)"
            >
              {{ opt.label }}
            </BaseTag>
            <!-- 达到上限时 hover 提示 -->
            <div
              v-if="isDisabled(opt.label)"
              class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-fast absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 rounded bg-navy text-white text-xs whitespace-nowrap z-10"
            >
              先取消一个已选的吧
            </div>
          </div>
        </div>
      </div>
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
  </div>
</template>
