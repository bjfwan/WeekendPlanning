/**
 * 数字滚动 composable
 * - 接收 target getter（返回 number），返回 displayValue ref（平滑过渡后的值）
 * - 内部用 gsap.to(obj, { value, duration, ease, onUpdate }) 实现滚动
 * - watch target 变化时触发滚动
 * - 尊重 prefers-reduced-motion（直接赋值不滚动）
 * - onBeforeUnmount 清理 tween
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { gsap } from 'gsap'
import { EASE_IN_OUT, prefersReducedMotion } from '@/composables/useGsap'

/** useGsapNumber 选项 */
export interface UseGsapNumberOptions {
  /** 滚动时长（秒），默认 0.6 */
  duration?: number
  /** 缓动函数，默认 'power2.out' */
  ease?: string
  /**
   * 是否在初始化时立即同步到目标值（不滚动）
   * 默认 false：初始化时从 0 滚动到目标值
   */
  immediate?: boolean
}

/**
 * 数字滚动 composable
 * @param target 目标值的 getter 函数或 ref
 * @param options 配置项
 * @returns displayValue ref（平滑过渡后的值）
 */
export function useGsapNumber(
  target: (() => number) | Ref<number>,
  options: UseGsapNumberOptions = {}
): Ref<number> {
  const { duration = 0.6, ease = 'power2.out', immediate = false } = options

  /** 解析 target 为 getter */
  const getTarget = (): number => {
    if (typeof target === 'function') return target()
    return target.value
  }

  /** 初始值：immediate 模式直接同步到目标值，否则从 0 开始 */
  const displayValue = ref<number>(immediate ? getTarget() : 0)

  /** 内部 tween 使用的可变对象 */
  const proxy = { value: displayValue.value }

  /** 当前活跃的 tween 实例 */
  let tween: gsap.core.Tween | null = null

  /**
   * 触发滚动到指定目标值
   * - prefers-reduced-motion 启用时直接赋值
   */
  const animateTo = (next: number): void => {
    // 清理上一个 tween
    if (tween) {
      tween.kill()
      tween = null
    }

    // reduced-motion：直接赋值
    if (prefersReducedMotion()) {
      proxy.value = next
      displayValue.value = next
      return
    }

    // 目标值与当前值相同：不触发动画
    if (proxy.value === next) {
      displayValue.value = next
      return
    }

    tween = gsap.to(proxy, {
      value: next,
      duration,
      ease,
      onUpdate: () => {
        displayValue.value = proxy.value
      }
    })
  }

  // 监听 target 变化触发滚动
  watch(
    () => getTarget(),
    (next) => {
      animateTo(next)
    },
    { immediate: !immediate }
  )

  // 组件卸载前清理 tween
  onBeforeUnmount(() => {
    if (tween) {
      tween.kill()
      tween = null
    }
  })

  return displayValue
}

// 重新导出 ease 常量，便于调用方就近引入
export { EASE_IN_OUT }
