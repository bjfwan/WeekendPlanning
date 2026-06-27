/**
 * 列表 stagger 入场指令
 * - 用 IntersectionObserver 监听元素进入视口
 * - 进入视口时用 gsap.from(targets, { y, opacity, stagger, duration, ease }) 触发入场
 * - 支持指令值配置：
 *   - v-stagger="0.1"  → stagger 间隔
 *   - v-stagger="{ y: 30, stagger: 0.08, selector: '.item' }"  → 完整配置
 * - 默认对直接子元素生效，支持 selector 参数指定目标
 * - 只触发一次（进入视口后 disconnect）
 * - 尊重 prefers-reduced-motion（直接显示，不做动画）
 */
import type { Directive, DirectiveBinding } from 'vue'
import { gsap } from 'gsap'
import { prefersReducedMotion } from '@/composables/useGsap'

/** v-stagger 指令配置 */
export interface StaggerOptions {
  /** Y 轴位移起点，默认 20 */
  y?: number
  /** X 轴位移起点，默认 0 */
  x?: number
  /** 起始透明度，默认 0 */
  opacity?: number
  /** stagger 间隔（秒），默认 0.06 */
  stagger?: number
  /** 单个元素动画时长（秒），默认 0.5 */
  duration?: number
  /** 缓动函数，默认 'power3.out' */
  ease?: string
  /** 目标子元素选择器，默认直接子元素 */
  selector?: string
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<Omit<StaggerOptions, 'selector'>> = {
  y: 20,
  x: 0,
  opacity: 0,
  stagger: 0.06,
  duration: 0.5,
  ease: 'power3.out'
}

/** 解析指令 binding.value 为 StaggerOptions */
function parseOptions(value: unknown): StaggerOptions {
  if (typeof value === 'number') {
    return { stagger: value }
  }
  if (value && typeof value === 'object') {
    return value as StaggerOptions
  }
  return {}
}

/** 获取目标元素列表 */
function getTargets(el: HTMLElement, selector?: string): Element[] {
  if (selector) {
    return Array.from(el.querySelectorAll(selector))
  }
  // 默认对直接子元素生效
  return Array.from(el.children)
}

/** 元素上挂载的 IntersectionObserver 引用 key */
const OBSERVER_KEY = '__vStaggerObserver__'

/**
 * v-stagger 指令实现
 */
export const vStagger: Directive<HTMLElement, StaggerOptions | number | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const options = { ...DEFAULT_OPTIONS, ...parseOptions(binding.value) }

    // 获取目标元素
    const targets = getTargets(el, options.selector)
    if (targets.length === 0) return

    // 尊重 prefers-reduced-motion：直接显示，不做动画
    if (prefersReducedMotion()) {
      gsap.set(targets, { clearProps: 'all' })
      return
    }

    // 初始隐藏
    gsap.set(targets, { y: options.y, x: options.x, opacity: options.opacity })

    // 不支持 IntersectionObserver 时直接播放动画
    if (typeof IntersectionObserver === 'undefined') {
      gsap.to(targets, {
        y: 0,
        x: 0,
        opacity: 1,
        stagger: options.stagger,
        duration: options.duration,
        ease: options.ease
      })
      return
    }

    // 监听进入视口
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // 进入视口：触发动画并 disconnect
            gsap.to(targets, {
              y: 0,
              x: 0,
              opacity: 1,
              stagger: options.stagger,
              duration: options.duration,
              ease: options.ease
            })
            observer.disconnect()
            // 清理引用
            delete (el as any)[OBSERVER_KEY]
            break
          }
        }
      },
      { threshold: 0.1 }
    )

    ;(el as any)[OBSERVER_KEY] = observer
    observer.observe(el)
  },

  unmounted(el: HTMLElement) {
    // 清理 observer，避免内存泄漏
    const observer: IntersectionObserver | undefined = (el as any)[OBSERVER_KEY]
    if (observer) {
      observer.disconnect()
      delete (el as any)[OBSERVER_KEY]
    }
  }
}
