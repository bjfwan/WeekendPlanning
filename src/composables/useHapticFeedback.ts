/**
 * 移动端触觉反馈 composable
 * 封装 navigator.vibrate，在不支持的设备上静默失败
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error'

/** 震动模式：number 为毫秒数，number[] 为交替 震动/停顿 */
const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  error: [40, 50, 40]
}

export function useHapticFeedback() {
  /** 触发一次触觉反馈，不支持 navigator.vibrate 时静默失败 */
  const trigger = (pattern: HapticPattern = 'light') => {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return
    navigator.vibrate(patterns[pattern])
  }
  return { trigger }
}
