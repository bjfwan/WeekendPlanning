/**
 * 行程分享相关 composable
 * 封装行程保存、按分享码查询、加入协同、成员订阅等能力
 */
import type { Plan, PlanPreferenceRecord, PlanRecord } from '@weekend-planner/shared'
import { supabase } from '@/lib/supabase'

/** API 基础地址，未配置时使用相对路径（依赖 Vite 代理） */
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/** 保存行程响应数据 */
interface SavePlanResponseData {
  shareCode: string
  planId: string
}

/** 拉取行程响应数据 */
interface FetchPlanResponseData {
  plan: Plan
  planId: string
}

/**
 * 通用请求封装：自动解析 JSON 并校验 success 字段
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) {
    throw new Error(`请求失败：${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as { success: boolean; data?: T; error?: string }
  if (!json.success) {
    throw new Error(json.error || '请求未成功')
  }
  return json.data as T
}

/**
 * 按分享码拉取行程
 * @param code 分享码
 * @returns 行程数据与 planId
 */
export async function fetchPlanByCode(code: string): Promise<FetchPlanResponseData> {
  return request<FetchPlanResponseData>(`${API_BASE}/api/plan/${code}`)
}

/**
 * 拉取当前用户的历史行程列表
 * @param userId 当前匿名用户 id
 * @returns 行程记录列表（按创建时间倒序）
 */
export async function fetchMyPlans(userId: string): Promise<PlanRecord[]> {
  const data = await request<{ plans: PlanRecord[] }>(
    `${API_BASE}/api/plan/history?userId=${encodeURIComponent(userId)}`
  )
  return data.plans
}

/**
 * 保存行程到后端，获取分享码
 * @param plan 行程数据
 * @param userId 当前匿名用户 id
 * @returns shareCode 与 planId
 */
export async function savePlan(
  plan: Plan,
  userId: string
): Promise<SavePlanResponseData> {
  return request<SavePlanResponseData>(`${API_BASE}/api/plan/save`, {
    method: 'POST',
    body: JSON.stringify({ plan, userId })
  })
}

/**
 * 加入行程协同
 * @param code 分享码
 * @param nickname 昵称
 * @param preferences 偏好标签
 * @param userId 当前匿名用户 id
 */
export async function joinPlan(
  code: string,
  nickname: string,
  preferences: string[],
  userId: string
): Promise<void> {
  await request<void>(`${API_BASE}/api/plan/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ nickname, preferences, userId })
  })
}

/**
 * 拉取已加入成员列表
 * @param code 分享码
 * @returns 成员偏好记录列表
 */
export async function fetchMembers(code: string): Promise<PlanPreferenceRecord[]> {
  const data = await request<{ members: PlanPreferenceRecord[] }>(
    `${API_BASE}/api/plan/${code}/members`
  )
  return data.members
}

/**
 * 订阅 plan_preferences 表的实时新增事件
 * @param code 分享码（用于标识订阅频道）
 * @param planId 行程 id（用于按 plan_id 过滤，避免收到全表事件）
 * @param callback 新增成员回调
 * @returns 取消订阅函数
 */
export function subscribeMembers(
  code: string,
  planId: string,
  callback: (member: PlanPreferenceRecord) => void
): () => void {
  const channel = supabase
    .channel(`plan_preferences:${code}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'plan_preferences',
        filter: 'plan_id=eq.' + planId
      },
      (payload) => {
        callback(payload.new as PlanPreferenceRecord)
      }
    )
    .subscribe()

  // 返回取消订阅函数
  return () => {
    supabase.removeChannel(channel)
  }
}
