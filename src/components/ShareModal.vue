<script setup lang="ts">
/** 分享成功模态弹窗 - 展示分享链接并提供复制/打开操作 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  /** 是否显示弹窗 */
  show: boolean
  /** 分享链接完整地址 */
  shareUrl: string
  /** 行程标题 */
  planTitle: string
  /** 行程城市 */
  planCity: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()

// DOM 引用
const overlayRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const successIconRef = ref<HTMLElement | null>(null)
const pulseRingRef = ref<HTMLElement | null>(null)
const copyBtnRef = ref<HTMLButtonElement | null>(null)
const urlInputRef = ref<HTMLInputElement | null>(null)

// 控制 DOM 存在（延迟移除以播放退场动画）
const visible = ref(false)

// 复制状态（由弹窗内部管理）
const copied = ref(false)
// 复制状态恢复定时器
let copyTimer: ReturnType<typeof setTimeout> | null = null

// 动画 timeline 引用
let enterTl: gsap.core.Timeline | null = null
let exitTl: gsap.core.Timeline | null = null
let pulseTl: gsap.core.Timeline | null = null
let copyTl: gsap.core.Timeline | null = null

// ESC 键关闭处理
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close')
  }
}

/** 成功图标脉冲环扩散（scale 1→2, opacity 0.6→0, repeat -1） */
function startPulse(): void {
  const ring = pulseRingRef.value
  if (!ring) return
  stopPulse()
  gsap.set(ring, { scale: 1, opacity: 0.6 })
  pulseTl = gsap.timeline({ repeat: -1 })
  pulseTl.to(ring, {
    scale: 2,
    opacity: 0,
    duration: 1.6,
    ease: 'none'
  })
}

/** 停止脉冲环 */
function stopPulse(): void {
  if (pulseTl) {
    pulseTl.kill()
    pulseTl = null
  }
  if (pulseRingRef.value) {
    gsap.set(pulseRingRef.value, { clearProps: 'all' })
  }
}

/** 模态框入场 timeline：遮罩淡入 + 主体弹性弹入 + 成功图标 stagger */
function playEnter(): void {
  if (enterTl) enterTl.kill()
  if (exitTl) exitTl.kill()
  const tl = gsap.timeline()
  enterTl = tl
  // 遮罩淡入
  if (overlayRef.value) {
    tl.from(overlayRef.value, { opacity: 0, duration: 0.2, ease: 'power2.out' })
  }
  // 主体从下方弹性弹入
  if (bodyRef.value) {
    tl.from(
      bodyRef.value,
      { y: 40, scale: 0.95, opacity: 0, duration: 0.5, ease: EASE_BACK },
      '<0.05'
    )
  }
  // 成功图标弹出
  if (successIconRef.value) {
    tl.from(
      successIconRef.value,
      { scale: 0, duration: 0.4, ease: EASE_BACK },
      '-=0.25'
    )
  }
  // 标题 / 副标题 stagger 入场
  const staggerEls = bodyRef.value
    ? Array.from(bodyRef.value.querySelectorAll<HTMLElement>('[data-stagger]'))
    : []
  if (staggerEls.length) {
    tl.from(
      staggerEls,
      { y: 12, opacity: 0, duration: 0.4, ease: EASE_OUT, stagger: 0.08 },
      '-=0.2'
    )
  }
}

/** 关闭过渡：主体向下消失 + 缩小 + 遮罩淡出 */
function playExit(): void {
  if (enterTl) enterTl.kill()
  stopPulse()
  const tl = gsap.timeline({
    onComplete: () => {
      visible.value = false
    }
  })
  exitTl = tl
  if (bodyRef.value) {
    tl.to(bodyRef.value, {
      y: 40,
      scale: 0.95,
      opacity: 0,
      duration: 0.25,
      ease: 'power2.in'
    })
  }
  if (overlayRef.value) {
    tl.to(
      overlayRef.value,
      { opacity: 0, duration: 0.2, ease: 'power2.in' },
      '<0.05'
    )
  }
}

/** 复制成功反馈 timeline：✓ 弹出 + 按钮颜色过渡 + 轻微抖动 */
function playCopyFeedback(): void {
  if (copyTl) copyTl.kill()
  const btn = copyBtnRef.value
  if (!btn) return
  copyTl = gsap.timeline()
  // 按钮颜色过渡：coral → mint
  copyTl.to(btn, { backgroundColor: '#4ECDC4', duration: 0.3, ease: EASE_OUT }, 0)
  // ✓ 图标弹出
  const checkIcon = btn.querySelector<HTMLElement>('[data-copy-check]')
  if (checkIcon) {
    copyTl.from(checkIcon, { scale: 0, duration: 0.3, ease: EASE_BACK }, 0.1)
  }
  // 轻微抖动（x: ±3, repeat: 2）
  copyTl.fromTo(
    btn,
    { x: 0 },
    {
      keyframes: [
        { x: -3, duration: 0.04 },
        { x: 3, duration: 0.04 },
        { x: -3, duration: 0.04 },
        { x: 0, duration: 0.04 }
      ],
      ease: 'none',
      clearProps: 'x'
    },
    0.3
  )
}

// 复制链接到剪贴板
async function handleCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.shareUrl)
  } catch {
    // 剪贴板不可用时回退到选中文本执行复制
    urlInputRef.value?.select()
    document.execCommand('copy')
  }
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 2000)
  // 复制成功反馈动画
  if (!prefersReducedMotion()) {
    await nextTick()
    playCopyFeedback()
  }
}

// 在新标签页打开分享链接
function handleOpen(): void {
  window.open(props.shareUrl, '_blank', 'noopener,noreferrer')
}

// 点击输入框时全选文本
function selectUrl(e: Event): void {
  ;(e.target as HTMLInputElement).select()
}

// 用 context 包装：卸载时自动 revert
context(() => {
  // 监听 show 变化：打开时入场 + 聚焦 + 监听 ESC，关闭时退场 + 重置状态
  watch(
    () => props.show,
    async (newVal) => {
      if (newVal) {
        visible.value = true
        window.addEventListener('keydown', handleKeydown)
        await nextTick()
        if (prefersReducedMotion()) {
          copyBtnRef.value?.focus()
          return
        }
        playEnter()
        startPulse()
        copyBtnRef.value?.focus()
      } else {
        window.removeEventListener('keydown', handleKeydown)
        // 重置复制状态
        copied.value = false
        if (copyTimer) {
          clearTimeout(copyTimer)
          copyTimer = null
        }
        if (!visible.value) return
        if (prefersReducedMotion()) {
          visible.value = false
          return
        }
        playExit()
      }
    },
    { immediate: true }
  )

  // 监听复制状态：恢复时把按钮颜色过渡回 coral
  watch(copied, (val) => {
    if (prefersReducedMotion()) return
    if (val) return
    if (copyBtnRef.value) {
      gsap.to(copyBtnRef.value, {
        backgroundColor: '#FF6B6B',
        duration: 0.3,
        ease: EASE_OUT,
        clearProps: 'backgroundColor'
      })
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    if (copyTimer) clearTimeout(copyTimer)
    if (enterTl) enterTl.kill()
    if (exitTl) exitTl.kill()
    if (pulseTl) pulseTl.kill()
    if (copyTl) copyTl.kill()
    if (overlayRef.value) gsap.killTweensOf(overlayRef.value)
    if (bodyRef.value) gsap.killTweensOf(bodyRef.value)
    if (successIconRef.value) gsap.killTweensOf(successIconRef.value)
    if (pulseRingRef.value) gsap.killTweensOf(pulseRingRef.value)
    if (copyBtnRef.value) gsap.killTweensOf(copyBtnRef.value)
  })
})
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩层 + 弹窗主体（由 visible 控制 DOM 存在，GSAP 驱动进出动画） -->
    <div
      v-if="visible"
      ref="overlayRef"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div
        ref="bodyRef"
        class="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <!-- 右上角关闭按钮 -->
        <button
          @click="emit('close')"
          class="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full bg-navy/5 text-navy/40 hover:bg-navy/10 hover:text-navy transition-all duration-200 z-10 focus-visible:ring-4 focus-visible:ring-coral/25 outline-none"
          aria-label="关闭弹窗"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <!-- 顶部装饰区域：成功图标 + 标题 -->
        <div
          class="relative px-8 pt-10 pb-6 text-center bg-gradient-to-b from-mint/15 via-mint/5 to-transparent"
        >
          <!-- 成功图标（带 GSAP 脉冲环扩散） -->
          <div class="relative inline-flex items-center justify-center w-20 h-20 mb-4">
            <span
              ref="pulseRingRef"
              class="absolute inset-0 rounded-full bg-mint/30"
            />
            <div
              ref="successIconRef"
              class="relative w-20 h-20 rounded-full bg-mint grid place-items-center shadow-lg"
            >
              <svg
                class="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h2
            id="share-modal-title"
            data-stagger
            class="font-display text-2xl font-bold text-navy mb-1"
          >
            分享链接已生成
          </h2>
          <p data-stagger class="text-sm text-navy/50">把这个链接发给小伙伴，一起规划周末吧 🎉</p>
        </div>

        <!-- 内容区域 -->
        <div class="px-8 pb-8 space-y-5">
          <!-- 行程信息卡片（让用户确认分享内容） -->
          <div
            class="flex items-center gap-3 p-4 rounded-2xl bg-cream/60 border border-amber/20"
          >
            <div
              class="shrink-0 w-10 h-10 grid place-items-center rounded-xl bg-coral/15 text-xl"
            >
              🗺️
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-navy truncate">{{ planTitle }}</p>
              <p class="text-xs text-navy/50 flex items-center gap-1">
                <span>📍</span>
                <span class="truncate">{{ planCity }}</span>
              </p>
            </div>
          </div>

          <!-- 分享链接展示 -->
          <div>
            <label
              class="block text-xs font-semibold text-navy/60 mb-2 uppercase tracking-wider"
            >
              分享链接
            </label>
            <input
              ref="urlInputRef"
              :value="shareUrl"
              readonly
              @click="selectUrl"
              class="w-full px-4 py-3 rounded-xl bg-cream/40 border-2 border-navy/10 text-sm text-navy/80 font-mono outline-none focus:border-mint focus:bg-white transition-all duration-200 cursor-text"
            />
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-3 pt-1">
            <!-- 复制链接主按钮 -->
            <button
              ref="copyBtnRef"
              @click="handleCopy"
              :class="[
                'flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold transition-colors duration-300 outline-none border-none cursor-pointer',
                'focus-visible:ring-4 focus-visible:ring-coral/30',
                copied
                  ? 'bg-mint text-white shadow-lg'
                  : 'bg-coral text-white shadow-lg hover:bg-coral-dark hover:-translate-y-0.5 active:translate-y-0'
              ]"
            >
              <svg
                v-if="copied"
                data-copy-check
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <svg
                v-else
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              {{ copied ? '✓ 已复制' : '复制链接' }}
            </button>

            <!-- 打开链接次按钮 -->
            <button
              @click="handleOpen"
              class="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold bg-amber text-navy shadow-md hover:bg-amber-light hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 outline-none border-none cursor-pointer focus-visible:ring-4 focus-visible:ring-amber/30"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              打开链接
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
