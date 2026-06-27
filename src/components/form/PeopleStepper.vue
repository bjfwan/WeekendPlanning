<script setup lang="ts">
/** 人数步进器：- [数字] +，支持长按加速 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { Minus, Plus, AlertCircle } from '@lucide/vue'
import { useHapticFeedback } from '@/composables/useHapticFeedback'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  /** 当前人数 */
  modelValue: number
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 错误信息 */
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 1,
  max: 10,
  error: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'blur': []
}>()

const { trigger: triggerHaptic } = useHapticFeedback()

// GSAP 入口：context 统一管理动画并在卸载时自动清理
const { gsap, context, EASE_OUT, EASE_IN_OUT, EASE_BACK } = useGsap()
const ctx = context(() => {})

/** 是否达到下限 */
const isMin = computed(() => props.modelValue <= props.min)
/** 是否达到上限 */
const isMax = computed(() => props.modelValue >= props.max)

/** 数字变化动画方向：递增向上，递减向下 */
const direction = ref<'up' | 'down'>('up')
// 当前显示的数字（动画过程中逐步切换）
const displayNumber = ref(props.modelValue)
// 数字 span 引用
const numberRef = ref<HTMLElement | null>(null)
// 数字切换 timeline 引用（用于在快速变化时清理）
let numberTl: ReturnType<typeof gsap.timeline> | null = null
// 上次变化时间戳，用于识别长按加速的快速连续变化
let lastChangeTime = 0

/** 改变人数 */
function change(delta: number) {
  const newVal = props.modelValue + delta
  if (newVal < props.min) {
    showBoundaryHint('min')
    return
  }
  if (newVal > props.max) {
    showBoundaryHint('max')
    return
  }
  direction.value = delta > 0 ? 'up' : 'down'
  emit('update:modelValue', newVal)
  // 轻触觉反馈
  triggerHaptic('light')
}

/** 失焦回调 */
function onBlur() {
  emit('blur')
}
/**
 * 数字切换 timeline
 * - 旧数字向上/下滑出（y: ±20, opacity: 0）
 * - 切换 displayNumber 后新数字从相反方向滑入（y: ±20 → 0, opacity: 0→1）
 * - 用 EASE_BACK 弹性
 * - 长按加速时（间隔 <200ms）跳过滑动，仅做轻微缩放反馈，避免动画堆积
 */
watch(
  () => props.modelValue,
  (newVal) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const rapid = now - lastChangeTime < 200
    lastChangeTime = now

    if (numberTl) {
      numberTl.kill()
      numberTl = null
    }
    const el = numberRef.value
    if (!el || prefersReducedMotion()) {
      displayNumber.value = newVal
      return
    }

    if (rapid) {
      // 快速连续变化（长按加速）：直接同步数值 + 轻微缩放反馈
      displayNumber.value = newVal
      gsap.fromTo(
        el,
        { scale: 0.85, opacity: 0.5 },
        { scale: 1, opacity: 1, duration: 0.2, ease: EASE_BACK, clearProps: 'transform,opacity' }
      )
      return
    }

    const outY = direction.value === 'up' ? -20 : 20
    const inY = direction.value === 'up' ? 20 : -20

    numberTl = gsap.timeline({
      onComplete: () => {
        numberTl = null
      }
    })
      // 旧数字向方向滑出
      .to(el, { y: outY, opacity: 0, duration: 0.13, ease: EASE_IN_OUT })
      // 切换为新数字
      .add(() => {
        displayNumber.value = newVal
      })
      .set(el, { y: inY, opacity: 0 })
      // 新数字弹性滑入
      .to(el, { y: 0, opacity: 1, duration: 0.3, ease: EASE_BACK, clearProps: 'transform,opacity' })
  }
)
/* ---------- 边界提示 ---------- */
const boundaryHint = ref('')
const showHint = ref(false)
// 控制 DOM 存在，配合 GSAP 做入场/出场
const hintVisible = ref(false)
const hintRef = ref<HTMLElement | null>(null)
let hintTimer: ReturnType<typeof setTimeout> | null = null
let hintTl: gsap.core.Tween | null = null

/** 显示一次性边界提示（弹性入场，1.5s 后淡出） */
function showBoundaryHint(type: 'min' | 'max') {
  boundaryHint.value = type === 'min' ? `最少 ${props.min} 人` : `最多 ${props.max} 人`
  showHint.value = true
  // 边界触发：错误触觉反馈
  triggerHaptic('error')
  if (hintTimer !== null) {
    clearTimeout(hintTimer)
  }
  hintTimer = setTimeout(() => {
    showHint.value = false
  }, 1500)
}

// 监听 showHint 用 GSAP 做弹性入场 / 淡出出场
watch(
  showHint,
  (val) => {
    ctx.add(() => {
      if (hintTl) {
        hintTl.kill()
        hintTl = null
      }
      if (val) {
        hintVisible.value = true
        nextTick(() => {
          const el = hintRef.value
          if (!el) return
          if (prefersReducedMotion()) {
            gsap.set(el, { y: 0, opacity: 1 })
            return
          }
          hintTl = gsap.fromTo(
            el,
            { y: 10, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.3, ease: EASE_BACK, clearProps: 'transform,opacity' }
          )
        })
      } else {
        const el = hintRef.value
        if (!el) {
          hintVisible.value = false
          return
        }
        if (prefersReducedMotion()) {
          hintVisible.value = false
          return
        }
        hintTl = gsap.to(el, {
          opacity: 0,
          duration: 0.2,
          ease: EASE_IN_OUT,
          onComplete: () => {
            hintVisible.value = false
          }
        })
      }
    })
  }
)

/** +/- 按钮点击弹性反馈（scale 1→0.9→1, EASE_BACK） */
function pulseButton(el: HTMLElement | null) {
  if (!el) return
  ctx.add(() => {
    if (prefersReducedMotion()) return
    gsap.killTweensOf(el)
    // 临时关闭 CSS 过渡，避免与 GSAP transform 动画冲突
    const prev = el.style.transition
    el.style.transition = 'none'
    gsap.timeline({
      onComplete: () => {
        el.style.transition = prev
        // 清除内联 transform，恢复 Tailwind active:scale-95 等类生效
        gsap.set(el, { clearProps: 'transform' })
      }
    })
      .to(el, { scale: 0.9, duration: 0.08, ease: EASE_OUT })
      .to(el, { scale: 1, duration: 0.25, ease: EASE_BACK })
  })
}

// 减号 / 加号按钮引用
const minusBtnRef = ref<HTMLButtonElement | null>(null)
const plusBtnRef = ref<HTMLButtonElement | null>(null)
/* ---------- 长按加速（P2） ---------- */
let pressTimer: ReturnType<typeof setTimeout> | null = null
let accelTimer: ReturnType<typeof setTimeout> | null = null
let didAccelerate = false
let activeDelta = 0
let pressCount = 0
let currentInterval = 150

/** 按下：启动 500ms 长按计时 */
function onPointerDown(delta: number) {
  // 边界禁用时不启动
  if ((delta < 0 && isMin.value) || (delta > 0 && isMax.value)) return
  didAccelerate = false
  activeDelta = delta
  pressCount = 0
  currentInterval = 150
  pressTimer = setTimeout(() => {
    didAccelerate = true
    accelLoop()
  }, 500)
}

/** 加速循环：每 currentInterval 递增 1，每 5 次频率翻倍 */
function accelLoop() {
  const newVal = props.modelValue + activeDelta
  if (newVal < props.min || newVal > props.max) {
    stopPress()
    showBoundaryHint(activeDelta > 0 ? 'max' : 'min')
    return
  }
  direction.value = activeDelta > 0 ? 'up' : 'down'
  emit('update:modelValue', newVal)
  pressCount++
  if (pressCount % 5 === 0) {
    currentInterval = Math.max(currentInterval / 2, 50)
  }
  accelTimer = setTimeout(accelLoop, currentInterval)
}

/** 松手 / 离开：停止加速 */
function stopPress() {
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
  if (accelTimer !== null) {
    clearTimeout(accelTimer)
    accelTimer = null
  }
}

/** 点击：若未触发加速则执行单次递增，并给按钮弹性反馈 */
function onClick(delta: number) {
  if (didAccelerate) {
    didAccelerate = false
    return
  }
  change(delta)
  pulseButton(delta < 0 ? minusBtnRef.value : plusBtnRef.value)
}

onBeforeUnmount(() => {
  if (hintTimer !== null) clearTimeout(hintTimer)
  stopPress()
})
</script>