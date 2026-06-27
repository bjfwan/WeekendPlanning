<script setup lang="ts">
/** 通用标签组件，支持选中状态（用于心情/兴趣多选） */
import { computed, ref, watch, nextTick, onBeforeUnmount, type Component } from 'vue'
import { Check } from '@lucide/vue'
import { iconMap } from '@/utils/icon-map'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  selected?: boolean
  emoji?: string
  icon?: string
  showCheck?: boolean
  /** 是否已达选择上限（用于触发未选标签抖动提示） */
  maxReached?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  showCheck: true,
  maxReached: false
})

defineEmits<{ click: [] }>()

const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()

const tagRef = ref<HTMLElement | null>(null)
const checkRef = ref<HTMLElement | null>(null)

/** 根据 icon 字符串名从静态映射表中查找对应组件（避免全量引入 @lucide/vue） */
const iconComponent = computed<Component | null>(() => {
  if (!props.icon) return null
  return iconMap[props.icon] ?? null
})

/** 选中态动画 timeline 引用（便于 kill） */
let selectTl: gsap.core.Timeline | null = null

/** 播放选中动画：弹性 scale（1→1.15→1）+ ✓ 图标弹出 */
function playSelect(): void {
  const el = tagRef.value
  if (!el) return
  if (selectTl) selectTl.kill()
  selectTl = gsap.timeline()
  selectTl
    .to(el, { scale: 1.15, duration: 0.15, ease: EASE_BACK })
    .to(el, { scale: 1, duration: 0.15, ease: EASE_BACK })
    .to(el, { clearProps: 'scale' })
  // ✓ 图标弹出（v-if 渲染后下一帧执行）
  nextTick(() => {
    if (checkRef.value) {
      gsap.from(checkRef.value, { scale: 0, duration: 0.3, ease: EASE_BACK })
    }
  })
}

/** 取消选中：反向弹性 scale */
function playDeselect(): void {
  const el = tagRef.value
  if (!el) return
  if (selectTl) selectTl.kill()
  selectTl = gsap.timeline()
  selectTl
    .to(el, { scale: 1.1, duration: 0.12, ease: EASE_BACK })
    .to(el, { scale: 1, duration: 0.12, ease: EASE_BACK })
    .to(el, { clearProps: 'scale' })
}

/** 达到上限提示：未选标签轻微抖动（x: ±5, repeat: 3） */
function shake(): void {
  const el = tagRef.value
  if (!el || prefersReducedMotion()) return
  gsap.fromTo(
    el,
    { x: 0 },
    {
      keyframes: [
        { x: -5, duration: 0.05 },
        { x: 5, duration: 0.05 },
        { x: -5, duration: 0.05 },
        { x: 5, duration: 0.05 },
        { x: 0, duration: 0.05 }
      ],
      ease: 'none',
      clearProps: 'x'
    }
  )
}

// 用 context 包装：卸载时自动 revert
context(() => {
  // 监听选中状态变化
  watch(
    () => props.selected,
    (sel, prev) => {
      if (sel === prev || prefersReducedMotion()) return
      if (sel) playSelect()
      else playDeselect()
    }
  )

  // 监听上限状态：达到上限且未选中时抖动
  watch(
    () => props.maxReached,
    (reached) => {
      if (!reached || props.selected || prefersReducedMotion()) return
      shake()
    }
  )

  onBeforeUnmount(() => {
    if (selectTl) selectTl.kill()
    if (tagRef.value) gsap.killTweensOf(tagRef.value)
    if (checkRef.value) gsap.killTweensOf(checkRef.value)
  })
})

// 暴露 shake 方法供父组件按需调用
defineExpose({ shake })
</script>

<template>
  <button
    ref="tagRef"
    type="button"
    @click="$emit('click')"
    :class="[
      'min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border-2 outline-none cursor-pointer',
      'transition-colors duration-normal ease-out-soft',
      'focus-visible:ring-4 focus-visible:ring-coral/20',
      'active:scale-95',
      selected
        ? 'bg-coral text-white border-coral shadow-md'
        : 'bg-white text-navy/70 border-navy/10 [@media(hover:hover)]:hover:border-coral/40 [@media(hover:hover)]:hover:bg-coral/5'
    ]"
  >
    <!-- 选中态 ✓ 图标（弹出动画） -->
    <span
      v-if="selected && showCheck"
      ref="checkRef"
      class="inline-flex shrink-0"
    >
      <Check :size="14" class="text-white" />
    </span>
    <!-- SVG 图标（优先于 emoji） -->
    <component
      v-if="iconComponent"
      :is="iconComponent"
      :size="16"
      :stroke-width="2"
      class="shrink-0"
    />
    <!-- emoji 图标 -->
    <span v-else-if="emoji" class="text-base leading-none">{{ emoji }}</span>
    <slot />
  </button>
</template>
