/**
 * 卡片 hover 指令
 * - mouseenter 时 gsap.to(el, { y, scale, boxShadow, duration, ease })
 * - mouseleave 时 gsap.to(el, { y: 0, scale: 1, boxShadow: 默认, duration, ease })
 * - 支持自定义参数：v-hover-card="{ y: -8, scale: 1.02 }"
 * - 尊重 prefers-reduced-motion（不绑定事件）
 */
import type { Directive, DirectiveBinding } from 'vue'
import { gsap } from 'gsap'
import { prefersReducedMotion } from '@/composables/useGsap'

/** v-hover-card 指令配置 */
export interface HoverCardOptions {
  /** hover 时 Y 轴位移，默认 -6 */
  y?: number
  /** hover 时缩放比例，默认 1.01 */
  scale?: number
  /** hover 时阴影，默认 '0 12px 40px rgba(26,26,46,0.14)' */
  boxShadow?: string
  /** 离开时阴影，默认 '0 4px 24px rgba(26,26,46,0.08)' */
  boxShadowLeave?: string
  /** 动画时长（秒），默认 0.3 */
  duration?: number
  /** 缓动函数，默认 'power2.out' */
  ease?: string
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<HoverCardOptions> = {
  y: -6,
  scale: 1.01,
  boxShadow: '0 12px 40px rgba(26,26,46,0.14)',
  boxShadowLeave: '0 4px 24px rgba(26,26,46,0.08)',
  duration: 0.3,
  ease: 'power2.out'
}

/** 解析指令 binding.value 为 HoverCardOptions */
function parseOptions(value: unknown): HoverCardOptions {
  if (value && typeof value === 'object') {
    return value as HoverCardOptions
  }
  return {}
}

/** 元素上挂载的事件处理函数 key */
const HANDLERS_KEY = '__vHoverCardHandlers__'

interface HoverHandlers {
  enter: (e: Event) => void
  leave: (e: Event) => void
}

/**
 * v-hover-card 指令实现
 */
export const vHoverCard: Directive<HTMLElement, HoverCardOptions | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    // 尊重 prefers-reduced-motion：不绑定事件
    if (prefersReducedMotion()) return

    const options = { ...DEFAULT_OPTIONS, ...parseOptions(binding.value) }

    // 记录初始 boxShadow，便于 leave 时回退（若未指定 boxShadowLeave）
    const computed = window.getComputedStyle(el)
    const initialBoxShadow =
      computed.boxShadow || DEFAULT_OPTIONS.boxShadowLeave

    const enter = (): void => {
      gsap.to(el, {
        y: options.y,
        scale: options.scale,
        boxShadow: options.boxShadow,
        duration: options.duration,
        ease: options.ease
      })
    }

    const leave = (): void => {
      gsap.to(el, {
        y: 0,
        scale: 1,
        boxShadow: options.boxShadowLeave || initialBoxShadow,
        duration: options.duration,
        ease: options.ease
      })
    }

    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)

    ;(el as any)[HANDLERS_KEY] = { enter, leave } as HoverHandlers
  },

  unmounted(el: HTMLElement) {
    // 移除事件监听，避免内存泄漏
    const handlers: HoverHandlers | undefined = (el as any)[HANDLERS_KEY]
    if (handlers) {
      el.removeEventListener('mouseenter', handlers.enter)
      el.removeEventListener('mouseleave', handlers.leave)
      delete (el as any)[HANDLERS_KEY]
    }
  }
}
