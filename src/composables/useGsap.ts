/**
 * GSAP 统一入口 composable
 * - 暴露 gsap 实例
 * - 提供 matchMedia 包装器：自动处理 prefers-reduced-motion: reduce（在该媒体查询下禁用动画，仅做即时设置）
 * - 提供 context 包装器：在 onBeforeUnmount 自动调用 ctx.revert() 清理
 * - 导出常用 ease 常量
 */
import { gsap } from 'gsap'
import { onBeforeUnmount } from 'vue'

/** 常用 ease 常量 */
export const EASE_OUT = 'power3.out'
export const EASE_IN_OUT = 'power2.inOut'
export const EASE_BACK = 'back.out(1.7)'
export const EASE_ELASTIC = 'elastic.out(1, 0.3)'
export const EASE_EXPO = 'expo.out'

/** prefers-reduced-motion 媒体查询字符串 */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 判断用户是否启用了「减少动态效果」偏好
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * matchMedia 回调签名
 * - 第一个参数为标准 MatchMedia 回调
 * - 第二个参数 isReduce 标识当前是否处于 reduced-motion 模式，便于在回调内做即时设置
 */
type MatchMediaCallback = (
  ctx: gsap.Context,
  isReduce: boolean
) => void

/** useGsap 返回值类型 */
export interface UseGsapReturn {
  /** gsap 实例 */
  gsap: typeof gsap
  /** ease 常量 */
  EASE_OUT: typeof EASE_OUT
  EASE_IN_OUT: typeof EASE_IN_OUT
  EASE_BACK: typeof EASE_BACK
  EASE_ELASTIC: typeof EASE_ELASTIC
  EASE_EXPO: typeof EASE_EXPO
  /**
   * matchMedia 包装器
   * - 自动处理 prefers-reduced-motion: reduce 分支：在该分支内不执行动画，由调用方自行做即时设置
   * - 返回 gsap.MatchMedia 实例，可在 onBeforeUnmount 时 kill
   */
  matchMedia: (callback: MatchMediaCallback) => gsap.MatchMedia
  /**
   * context 包装器
   * - 在 onBeforeUnmount 自动调用 ctx.revert() 清理
   * - 返回创建的 gsap.Context
   */
  context: (
    func?: (self: gsap.Context) => void,
    scope?: Element | Record<string, any> | string
  ) => gsap.Context
}

/**
 * GSAP 统一入口 composable
 */
export function useGsap(): UseGsapReturn {
  /**
   * matchMedia 包装器
   * - 注册 reduced-motion 分支：仅做即时设置（不传动画相关配置）
   * - 注册常规分支：调用 callback(ctx, false)
   */
  const matchMedia = (callback: MatchMediaCallback): gsap.MatchMedia => {
    const mm = gsap.matchMedia()

    // reduced-motion 分支：禁用动画，仅做即时设置
    mm.add(REDUCED_MOTION_QUERY, (ctx) => {
      callback(ctx, true)
    })

    // 常规分支：正常执行动画
    mm.add('(prefers-reduced-motion: no-preference)', (ctx) => {
      callback(ctx, false)
    })

    return mm
  }

  /**
   * context 包装器
   * - 创建 gsap.context
   * - 在 onBeforeUnmount 自动调用 ctx.revert()
   */
  const context: UseGsapReturn['context'] = (func, scope) => {
    const ctx = gsap.context(func, scope)
    onBeforeUnmount(() => {
      ctx.revert()
    })
    return ctx
  }

  return {
    gsap,
    EASE_OUT,
    EASE_IN_OUT,
    EASE_BACK,
    EASE_ELASTIC,
    EASE_EXPO,
    matchMedia,
    context
  }
}
