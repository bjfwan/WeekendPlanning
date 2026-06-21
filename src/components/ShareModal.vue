<script setup lang="ts">
/** 分享成功模态弹窗 - 展示分享链接并提供复制/打开操作 */
import { ref, watch, nextTick, onUnmounted } from 'vue'

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

// 复制状态（由弹窗内部管理）
const copied = ref(false)
// 复制按钮引用，用于打开时聚焦
const copyBtnRef = ref<HTMLButtonElement | null>(null)
// 链接输入框引用，用于剪贴板回退方案
const urlInputRef = ref<HTMLInputElement | null>(null)
// 复制状态恢复定时器
let copyTimer: ReturnType<typeof setTimeout> | null = null

// ESC 键关闭处理
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

// 监听 show 变化：打开时聚焦复制按钮并监听 ESC，关闭时重置状态
watch(
  () => props.show,
  async (newVal) => {
    if (newVal) {
      window.addEventListener('keydown', handleKeydown)
      await nextTick()
      copyBtnRef.value?.focus()
    } else {
      window.removeEventListener('keydown', handleKeydown)
      // 重置复制状态
      copied.value = false
      if (copyTimer) {
        clearTimeout(copyTimer)
        copyTimer = null
      }
    }
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (copyTimer) clearTimeout(copyTimer)
})

// 复制链接到剪贴板
async function handleCopy() {
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
}

// 在新标签页打开分享链接
function handleOpen() {
  window.open(props.shareUrl, '_blank', 'noopener,noreferrer')
}

// 点击输入框时全选文本
function selectUrl(e: Event) {
  ;(e.target as HTMLInputElement).select()
}
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩层：淡入淡出 -->
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-200 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <!-- 弹窗主体：从下往上滑入 + 缩放 -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          leave-active-class="transition-all duration-200 ease-in"
          enter-from-class="translate-y-8 scale-95 opacity-0"
          leave-to-class="translate-y-8 scale-95 opacity-0"
        >
          <div
            v-if="show"
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
              <!-- 成功图标（带脉冲动画） -->
              <div class="relative inline-flex items-center justify-center w-20 h-20 mb-4">
                <span
                  class="absolute inset-0 rounded-full bg-mint/30 animate-ping opacity-60"
                />
                <div
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
                class="font-display text-2xl font-bold text-navy mb-1"
              >
                分享链接已生成
              </h2>
              <p class="text-sm text-navy/50">把这个链接发给小伙伴，一起规划周末吧 🎉</p>
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
                    'flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 outline-none border-none cursor-pointer',
                    'focus-visible:ring-4 focus-visible:ring-coral/30',
                    copied
                      ? 'bg-mint text-white shadow-lg'
                      : 'bg-coral text-white shadow-lg hover:bg-coral-dark hover:-translate-y-0.5 active:translate-y-0'
                  ]"
                >
                  <svg
                    v-if="copied"
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
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
