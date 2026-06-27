<script setup lang="ts">
/** 通用输入框组件，支持 v-model */
import { ref, watch, onBeforeUnmount } from 'vue'
import { useGsap, prefersReducedMotion } from '@/composables/useGsap'

interface Props {
  modelValue: string | number
  label?: string
  placeholder?: string
  error?: string
  type?: string
  required?: boolean
  min?: string | number
  max?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  required: false
})

defineEmits<{
  'update:modelValue': [value: string]
}>()

const { gsap, context, EASE_OUT, EASE_BACK } = useGsap()

const inputRef = ref<HTMLInputElement | null>(null)
const labelRef = ref<HTMLLabelElement | null>(null)

// 边框颜色常量
const REST_BORDER = 'rgba(26,26,46,0.1)'
const HOVER_BORDER = 'rgba(26,26,46,0.2)'
const CORAL_BORDER = '#FF6B6B'
const ERROR_BORDER = '#F87171'
const NAVY_TEXT = '#1A1A2E'

// 焦点 / 悬停状态
let focused = false
let hovering = false

/** 计算当前目标边框颜色（error > focus > hover > rest） */
function targetBorder(): string {
  if (props.error) return ERROR_BORDER
  if (focused) return CORAL_BORDER
  if (hovering) return HOVER_BORDER
  return REST_BORDER
}

/** 边框颜色过渡 */
function updateBorder(): void {
  if (prefersReducedMotion() || !inputRef.value) return
  gsap.to(inputRef.value, {
    borderColor: targetBorder(),
    duration: 0.25,
    ease: EASE_OUT
  })
}

/** focus：label 上浮 + 边框弹性过渡 + 轻微缩放 */
function handleFocus(): void {
  focused = true
  if (prefersReducedMotion()) return
  updateBorder()
  if (labelRef.value) {
    gsap.to(labelRef.value, {
      y: -2,
      scale: 0.92,
      color: props.error ? ERROR_BORDER : CORAL_BORDER,
      duration: 0.3,
      ease: EASE_BACK,
      transformOrigin: 'left center'
    })
  }
}

/** blur：反向 */
function handleBlur(): void {
  focused = false
  if (prefersReducedMotion()) return
  updateBorder()
  if (labelRef.value) {
    gsap.to(labelRef.value, {
      y: 0,
      scale: 1,
      color: NAVY_TEXT,
      duration: 0.3,
      ease: EASE_OUT,
      transformOrigin: 'left center'
    })
  }
}

/** 鼠标进入：边框过渡到 hover 色 */
function handleEnter(): void {
  hovering = true
  updateBorder()
}

/** 鼠标离开：边框恢复 */
function handleLeave(): void {
  hovering = false
  updateBorder()
}

// 用 context 包装：卸载时自动 revert
context(() => {
  // error 抖动 + 红色边框闪烁
  watch(
    () => props.error,
    (err, prev) => {
      if (err === prev || prefersReducedMotion()) return
      if (err) {
        // 出错：边框变红 + 输入框抖动
        if (inputRef.value) {
          gsap.to(inputRef.value, {
            borderColor: ERROR_BORDER,
            duration: 0.2,
            ease: EASE_OUT
          })
          gsap.fromTo(
            inputRef.value,
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
      } else {
        // 错误清除：恢复边框
        updateBorder()
      }
    }
  )

  onBeforeUnmount(() => {
    if (inputRef.value) gsap.killTweensOf(inputRef.value)
    if (labelRef.value) gsap.killTweensOf(labelRef.value)
  })
})
</script>

<template>
  <div class="w-full">
    <label
      v-if="label"
      ref="labelRef"
      class="block mb-2 text-sm font-semibold text-navy"
    >
      {{ label }}
      <span v-if="required" class="text-coral">*</span>
    </label>
    <input
      ref="inputRef"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :min="min"
      :max="max"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="handleFocus"
      @blur="handleBlur"
      @mouseenter="handleEnter"
      @mouseleave="handleLeave"
      :class="[
        'w-full px-4 py-3 rounded-xl bg-white border-2 transition-shadow duration-200 outline-none',
        'placeholder:text-navy/30 text-navy',
        'focus:ring-4',
        error
          ? 'border-red-400 focus:ring-red-100 hover:border-red-400'
          : 'border-navy/10 focus:ring-coral/15 hover:border-navy/20'
      ]"
    />
    <p v-if="error" class="mt-1.5 text-sm text-red-500">{{ error }}</p>
  </div>
</template>
