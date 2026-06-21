import { ref, readonly } from 'vue'
import { useStream } from './useStream'
import type { GeneratePlanRequest } from '@weekend-planner/shared'

/** API 基础地址，未配置时使用相对路径（依赖 Vite 代理） */
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 跨页面共享的行程请求参数
 * HomeView 提交后写入，PlanView 读取后调用生成
 */
export const planRequest = ref<GeneratePlanRequest | null>(null)

/**
 * 行程生成 composable
 * 封装 useStream，提供生成、重试、取消能力
 */
export function usePlan() {
  const stream = useStream()

  /** 调用后端生成行程（SSE 流式） */
  async function generatePlan(request: GeneratePlanRequest): Promise<void> {
    await stream.start(`${API_BASE}/api/plan/generate`, request)
  }

  /** 重试：重置状态后重新生成 */
  async function retry(request: GeneratePlanRequest): Promise<void> {
    stream.reset()
    await generatePlan(request)
  }

  /** 取消生成 */
  function cancel(): void {
    stream.cancel()
  }

  return {
    // 流式状态
    content: stream.content,
    plan: stream.plan,
    status: stream.status,
    error: stream.error,
    meta: stream.meta,
    // 操作方法
    generatePlan,
    retry,
    cancel,
    reset: stream.reset
  }
}
