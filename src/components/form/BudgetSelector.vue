<script setup lang="ts">
/** 预算选择器：档位按钮 + 滑块 + 数值显示 */
import { ref, computed } from 'vue'
import { JapaneseYen, AlertCircle } from '@lucide/vue'
import { useHapticFeedback } from '@/composables/useHapticFeedback'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'
import { useGsapNumber } from '@/composables/useGsapNumber'

interface Props {
  /** 当前预算值 */
  modelValue: number
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 错误信息 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 100,
  max: 5000,
  error: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'blur': []
}>()

const { trigger: triggerHaptic } = useHapticFeedback()

// GSAP 入口：context 统一管理动画并在卸载时自动清理
const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()
const ctx = context(() => {})

interface Tier {
  key: string
  label: string
  emoji: string
  median: number
  match: (v: number) => boolean
}

/** 档位定义：经济 ≤299，舒适 300-999，豪华 ≥1000 */
const tiers: Tier[] = [
  { key: 'economy', label: '经济', emoji: '💰', median: 200, match: v => v <= 299 },
  { key: 'comfort', label: '舒适', emoji: '🛋️', median: 600, match: v => v >= 300 && v <= 999 },
  { key: 'luxury', label: '豪华', emoji: '✨', median: 1500, match: v => v >= 1000 }
]

/** 当前所处档位 */
const currentTier = computed(() => tiers.find(t => t.match(props.modelValue)) ?? tiers[0])

/** 滑块进度百分比（0-100） */
const progress = computed(() => {
  const clamped = Math.max(props.min, Math.min(props.max, props.modelValue))
  return ((clamped - props.min) / (props.max - props.min)) * 100
})

/** 数值显示：用 useGsapNumber 替代手写 rAF，保持 200ms ease-out 视觉效果 */
const displayValueRaw = useGsapNumber(() => props.modelValue, {
  duration: 0.2,
  ease: EASE_OUT,
  immediate: true
})
// useGsapNumber 内部为浮点，显示时取整保持与原实现一致
const displayValue = computed(() => Math.round(displayValueRaw.value))

// 滑块引用（用于手柄脉冲动画）
const sliderRef = ref<HTMLInputElement | null>(null)
// 档位按钮容器引用
const tierContainerRef = ref<HTMLElement | null>(null)

/** 滑块拖动 */
function onSliderInput(e: Event) {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}

/** 滑块失焦 */
function onSliderBlur() {
  emit('blur')
}

/** 档位切换：滑块手柄弹性脉冲（scale 1→1.15→1） */
function pulseSliderThumb() {
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const el = sliderRef.value
    if (!el) return
    // 通过 CSS 变量驱动伪元素手柄缩放，避免直接操作伪元素
    el.classList.add('is-pulsing')
    const proxy = { s: 1 }
    gsap.timeline({
      onComplete: () => {
        el.classList.remove('is-pulsing')
        el.style.removeProperty('--thumb-scale')
      }
    })
      .to(proxy, {
        s: 1.15,
        duration: 0.12,
        ease: EASE_OUT,
        onUpdate: () => el.style.setProperty('--thumb-scale', String(proxy.s))
      })
      .to(proxy, {
        s: 1,
        duration: 0.22,
        ease: EASE_BACK,
        onUpdate: () => el.style.setProperty('--thumb-scale', String(proxy.s))
      })
  })
}

/** 点击档位 → 跳转到区间中位数 */
function selectTier(tier: Tier) {
  emit('update:modelValue', tier.median)
  // 档位切换：中等触觉反馈
  triggerHaptic('medium')
  // 滑块手柄脉冲
  pulseSliderThumb()
  // 档位按钮弹性 + 未选中项轻微位移
  ctx.add(() => {
    if (prefersReducedMotion()) return
    const container = tierContainerRef.value
    if (!container) return
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    const selectedIdx = tiers.findIndex(t => t.key === tier.key)
    buttons.forEach((btn, i) => {
      // 临时关闭 CSS 过渡，避免与 GSAP transform 动画冲突
      const prevTransition = btn.style.transition
      btn.style.transition = 'none'
      const tl = gsap.timeline({
        onComplete: () => {
          btn.style.transition = prevTransition
          // 清除内联 transform，恢复 Tailwind active:scale-95 等类生效
          gsap.set(btn, { clearProps: 'transform' })
        }
      })
      if (i === selectedIdx) {
        // 选中项弹性放大回弹
        tl.to(btn, { scale: 1.1, duration: 0.15, ease: EASE_OUT })
          .to(btn, { scale: 1, duration: 0.25, ease: EASE_BACK })
      } else {
        // 未选中项轻微下压回弹
        tl.to(btn, { y: 4, duration: 0.1, ease: EASE_OUT })
          .to(btn, { y: 0, duration: 0.22, ease: EASE_BACK })
      }
    })
  })
}

/** aria-valuetext：如"舒适档位，500元" */
const ariaValueText = computed(() => `${currentTier.value.label}档位，${props.modelValue}元`)
</script>
<template>
  <div class="w-full">
    <!-- 数值显示 -->
    <div class="flex items-end justify-between mb-5">
      <div class="flex items-center gap-1.5">
        <JapaneseYen class="w-5 h-5 text-coral" />
        <span class="text-4xl font-bold text-navy tabular-nums">{{ displayValue }}</span>
      </div>
      <div class="flex items-center gap-1.5 text-base font-medium text-navy/60">
        <span>{{ currentTier.label }}</span>
        <span class="text-xl leading-none">{{ currentTier.emoji }}</span>
      </div>
    </div>

    <!-- 滑块（原生 input range 自定义样式） -->
    <input
      ref="sliderRef"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue"
      :aria-valuetext="ariaValueText"
      role="slider"
      aria-label="预算"
      class="budget-slider w-full select-none"
      :style="{ '--progress': progress + '%' } as Record<string, string>"
      @input="onSliderInput"
      @blur="onSliderBlur"
    />

    <!-- 范围标签 -->
    <div class="flex justify-between mt-2 mb-5 text-xs text-navy/40">
      <span>¥{{ min }}</span>
      <span>¥{{ max }}</span>
    </div>

    <!-- 档位按钮 -->
    <div ref="tierContainerRef" class="grid grid-cols-3 gap-2.5">
      <button
        v-for="tier in tiers"
        :key="tier.key"
        type="button"
        @click="selectTier(tier)"
        @blur="onSliderBlur"
        :aria-pressed="currentTier.key === tier.key"
        :class="[
          'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium border-2 outline-none cursor-pointer select-none',
          'transition-all duration-[250ms] ease-out',
          'focus-visible:ring-4 focus-visible:ring-coral/20',
          currentTier.key === tier.key
            ? 'bg-coral text-white border-coral shadow-md'
            : error
              ? 'bg-white text-navy/60 border-coral/30 [@media(hover:hover)]:hover:border-coral/40 [@media(hover:hover)]:hover:bg-coral/5'
              : 'bg-white text-navy/60 border-navy/10 [@media(hover:hover)]:hover:border-coral/40 [@media(hover:hover)]:hover:bg-coral/5'
        ]"
      >
        <span class="text-base leading-none">{{ tier.emoji }}</span>
        <span>{{ tier.label }}</span>
      </button>
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

<style scoped>
.budget-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 24px;
  background: transparent;
  cursor: pointer;
  outline: none;
}

/* WebKit 轨道 */
.budget-slider::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    #FF6B6B var(--progress, 0%),
    rgba(26, 26, 46, 0.1) var(--progress, 0%)
  );
}

/* WebKit 手柄 */
.budget-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  margin-top: -8px;
  border-radius: 9999px;
  background: #ffffff;
  border: 2px solid #FF6B6B;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  transition: transform 150ms ease-out;
  cursor: grab;
  /* 通过 CSS 变量驱动手柄缩放，便于 GSAP 脉冲 */
  transform: scale(var(--thumb-scale, 1));
}

/* Firefox 轨道 */
.budget-slider::-moz-range-track {
  height: 8px;
  border-radius: 9999px;
  background: rgba(26, 26, 46, 0.1);
}

/* Firefox 填充 */
.budget-slider::-moz-range-progress {
  height: 8px;
  border-radius: 9999px;
  background: #FF6B6B;
}

/* Firefox 手柄 */
.budget-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 9999px;
  background: #ffffff;
  border: 2px solid #FF6B6B;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  transition: transform 150ms ease-out;
  cursor: grab;
  transform: scale(var(--thumb-scale, 1));
}

/* 脉冲期间关闭手柄过渡，让 GSAP 逐帧更新更干脆 */
.budget-slider.is-pulsing::-webkit-slider-thumb,
.budget-slider.is-pulsing::-moz-range-thumb {
  transition: none;
}

/* hover（仅 hover 设备） */
@media (hover: hover) {
  .budget-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }
  .budget-slider::-moz-range-thumb:hover {
    transform: scale(1.1);
  }
}

/* active */
.budget-slider::-webkit-slider-thumb:active {
  transform: scale(1.25);
  cursor: grabbing;
}
.budget-slider::-moz-range-thumb:active {
  transform: scale(1.25);
  cursor: grabbing;
}

/* focus-visible 焦点环 */
.budget-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.2),
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -2px rgba(0, 0, 0, 0.1);
}
.budget-slider:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.2),
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -2px rgba(0, 0, 0, 0.1);
}

/* 移动端手柄放大（触摸友好） */
@media (pointer: coarse) {
  .budget-slider::-webkit-slider-thumb {
    width: 32px;
    height: 32px;
    margin-top: -12px;
  }
  .budget-slider::-moz-range-thumb {
    width: 32px;
    height: 32px;
  }
}
</style>