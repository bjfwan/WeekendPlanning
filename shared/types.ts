/**
 * AI 周末规划师 - 前后端共享类型定义
 */

// ========== 基础类型 ==========

/** 行程时长 */
export type PlanDuration = 'half-day' | '1-day' | '2-day' | '3-day'

/** 出行方式 */
export type TransportMode = 'public' | 'driving' | 'walking' | 'mixed'

// ========== 多人偏好 ==========

/** 多人偏好（单人） */
export interface MultiUser {
  nickname: string
  preferences: string[]
}

// ========== 行程生成请求 ==========

/** 行程生成请求 */
export interface GeneratePlanRequest {
  city: string
  date: string
  duration: PlanDuration
  budget: number
  people: number
  mood: string[]
  interests: string[]
  transport: TransportMode
  multiUsers?: MultiUser[]
  adjustFrom?: string
  userConfig?: UserAIConfig
}

/** 用户自定义 AI 配置（可覆盖后端默认） */
export interface UserAIConfig {
  apiUrl?: string
  apiKey?: string
  model?: string
}

// ========== 行程结果 ==========

/** 单个行程项 */
export interface PlanItem {
  time: string
  endTime?: string
  title: string
  location: string
  address?: string
  description: string
  cost: number
  duration: string
  transport?: string
  alternatives?: string[]
  tips?: string
  locationLng?: number
  locationLat?: number
}

/** 单日行程 */
export interface DayPlan {
  day: number
  date: string
  items: PlanItem[]
  totalCost: number
}

/** 天气信息 */
export interface WeatherInfo {
  condition: string
  temperature: string
  suggestion: string
}

/** 出行清单 */
export interface PlanChecklist {
  items: string[]
  reminders: string[]
  mapLinks: string[]
}

/** 完整行程 */
export interface Plan {
  id: string
  city: string
  title: string
  summary: string
  days: DayPlan[]
  totalCost: number
  budget: number
  checklist: PlanChecklist
  weather?: WeatherInfo
}

// ========== SSE 事件 ==========

/** SSE meta 事件 */
export interface SSEMeta {
  planId: string
  createdAt: string
}

/** SSE chunk 事件 */
export interface SSEChunk {
  content: string
}

/** SSE done 事件 */
export interface SSEDone {
  plan: Plan
}

/** SSE error 事件 */
export interface SSEError {
  message: string
  code?: string
}

// ========== API 响应 ==========

/** 统一 API 响应 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// ========== Supabase 数据库表 ==========

/** plans 表 */
export interface PlanRecord {
  id: string
  user_id: string | null
  title: string
  city: string
  date: string
  duration: PlanDuration
  budget: number
  people: number
  mood: string[]
  interests: string[]
  transport: TransportMode
  plan_data: Plan
  share_code: string | null
  status: 'draft' | 'active' | 'completed'
  created_at: string
  updated_at: string
}

/** plan_preferences 表 */
export interface PlanPreferenceRecord {
  id: string
  plan_id: string
  user_id: string | null
  nickname: string
  preferences: string[]
  created_at: string
}
