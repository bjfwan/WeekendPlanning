import { Router } from 'express'
import { randomBytes } from 'crypto'
import type {
  GeneratePlanRequest,
  Plan,
  PlanDuration,
  PlanPreferenceRecord,
  PlanRecord
} from '@weekend-planner/shared'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { optionalAuth } from '../middleware/auth.js'

// 补充 Express Request.user 类型声明
// auth.ts 中已有同名声明（declare module 'express'），但 Router handler 的 Request
// 类型实际来自 express-serve-static-core，这里补充该模块的声明确保 req.user 可用
declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string } | null
  }
}

export const shareRouter = Router()

// 防御性挂载可选 JWT 校验中间件：app.ts 已挂载一次，这里再挂载确保路由自洽
// 校验成功后 req.user.id 为可信用户 id，路由优先使用它避免 userId 伪造越权
shareRouter.use(optionalAuth)

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * 生成随机 base62 分享码（使用 crypto.randomBytes 确保随机性）
 */
function generateShareCode(length = 8): string {
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % 62]
  }
  return result
}

/**
 * 根据 plan.days 长度推断行程时长（request 字段缺失时的兜底方案）
 */
function inferDuration(dayCount: number): PlanDuration {
  if (dayCount >= 3) return '3-day'
  if (dayCount === 2) return '2-day'
  if (dayCount === 1) return '1-day'
  return 'half-day'
}

/**
 * POST /api/plan/save
 * 保存行程并生成分享码
 */
shareRouter.post('/save', async (req, res) => {
  try {
    const { plan, request, userId: bodyUserId } = req.body as {
      plan: Plan
      request?: GeneratePlanRequest
      userId?: string
    }
    // 优先使用 JWT 校验后的可信用户 id，未登录时回退到 body.userId 保持兼容
    const userId = req.user?.id || bodyUserId

    if (!plan || !userId) {
      res.status(400).json({ success: false, error: '缺少 plan 或 userId' })
      return
    }

    // 回填生成请求中的字段（Plan 类型本身不包含 duration/people/mood/interests）
    // request 缺失时从 plan 对象推断兜底值
    const duration: PlanDuration = request?.duration || inferDuration(plan.days.length)
    const people = request?.people ?? 0
    const mood = request?.mood ?? []
    const interests = request?.interests ?? []
    const transport = request?.transport || plan.transport || ''

    // 生成分享码，冲突时重试（最多 3 次）
    let shareCode = ''
    let insertedId = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      shareCode = generateShareCode(8)
      const { data, error } = await supabaseAdmin
        .from('plans')
        .insert({
          user_id: userId,
          title: plan.title,
          city: plan.city,
          date: plan.days[0]?.date || '',
          duration,
          budget: plan.budget,
          people,
          mood,
          interests,
          transport,
          plan_data: plan,
          share_code: shareCode,
          status: 'active'
        })
        .select('id')
        .single()

      if (error) {
        // 23505 = unique_violation（share_code 冲突），重试
        if (error.code === '23505' && attempt < 2) {
          continue
        }
        throw new Error(`保存行程失败: ${error.message}`)
      }

      insertedId = data.id
      break
    }

    res.json({
      success: true,
      data: { shareCode, planId: insertedId }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存行程失败'
    console.error('[plan/save] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/plan/history
 * 查询当前用户的全部历史行程（按创建时间倒序）
 * query: userId - 当前匿名用户 id（未登录时的回退方案）
 */
shareRouter.get('/history', async (req, res) => {
  try {
    // 优先使用 JWT 校验后的可信用户 id，未登录时回退到 query.userId 保持兼容
    const userId = req.user?.id || (req.query.userId as string | undefined)

    if (!userId) {
      res.status(400).json({ success: false, error: '缺少 userId 参数' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('plans')
      .select(
        'id, title, city, date, budget, people, share_code, status, created_at, plan_data'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`查询历史行程失败: ${error.message}`)
    }

    res.json({
      success: true,
      data: { plans: (data || []) as PlanRecord[] }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询历史行程失败'
    console.error('[plan/history] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/plan/member-counts
 * 批量获取用户所有行程的成员数映射，避免"我的行程"页面逐个查询
 * query: userId - 当前用户 id
 * 返回: { counts: Record<planId, number> }
 */
shareRouter.get('/member-counts', async (req, res) => {
  try {
    const userId = req.user?.id || (req.query.userId as string | undefined)

    if (!userId) {
      res.status(400).json({ success: false, error: '缺少 userId 参数' })
      return
    }

    // 1. 查询用户所有行程的 id
    const { data: plans, error: plansError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('user_id', userId)

    if (plansError) {
      throw new Error(`查询用户行程失败: ${plansError.message}`)
    }

    if (!plans || plans.length === 0) {
      res.json({ success: true, data: { counts: {} } })
      return
    }

    const planIds = plans.map((p) => p.id)

    // 2. 批量查询这些行程的协同成员（仅取 plan_id 字段减少传输量）
    const { data: prefs, error: prefsError } = await supabaseAdmin
      .from('plan_preferences')
      .select('plan_id')
      .in('plan_id', planIds)

    if (prefsError) {
      throw new Error(`查询成员数失败: ${prefsError.message}`)
    }

    // 3. 客户端聚合统计，确保未加入成员的行程也返回 0
    const counts: Record<string, number> = {}
    for (const id of planIds) {
      counts[id] = 0
    }
    for (const pref of prefs || []) {
      counts[pref.plan_id] = (counts[pref.plan_id] || 0) + 1
    }

    res.json({ success: true, data: { counts } })
  } catch (err) {
    const message = err instanceof Error ? err.message : '批量查询成员数失败'
    console.error('[plan/member-counts] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/plan/:code
 * 通过分享码获取行程
 */
shareRouter.get('/:code', async (req, res) => {
  try {
    const { code } = req.params

    const { data, error } = await supabaseAdmin
      .from('plans')
      .select('id, plan_data')
      .eq('share_code', code)
      .maybeSingle()

    if (error) {
      throw new Error(`查询行程失败: ${error.message}`)
    }

    if (!data) {
      res.status(404).json({ success: false, error: '行程不存在或分享码无效' })
      return
    }

    res.json({
      success: true,
      data: { plan: data.plan_data as Plan, planId: data.id as string }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询行程失败'
    console.error('[plan/:code] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * POST /api/plan/:code/join
 * 加入行程（提交协同偏好）
 */
shareRouter.post('/:code/join', async (req, res) => {
  try {
    const { code } = req.params
    const { nickname, preferences, userId } = req.body as {
      nickname: string
      preferences: string[]
      userId: string
    }

    if (!nickname || !userId) {
      res.status(400).json({ success: false, error: '缺少 nickname 或 userId' })
      return
    }

    // 先找到 plan_id
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('share_code', code)
      .maybeSingle()

    if (planError) {
      throw new Error(`查询行程失败: ${planError.message}`)
    }

    if (!plan) {
      res.status(404).json({ success: false, error: '行程不存在或分享码无效' })
      return
    }

    // 插入协同偏好
    const { error: insertError } = await supabaseAdmin
      .from('plan_preferences')
      .insert({
        plan_id: plan.id,
        user_id: userId,
        nickname,
        preferences: preferences || []
      })

    if (insertError) {
      throw new Error(`加入行程失败: ${insertError.message}`)
    }

    res.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '加入行程失败'
    console.error('[plan/:code/join] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/plan/:code/members
 * 获取行程的协同成员列表
 */
shareRouter.get('/:code/members', async (req, res) => {
  try {
    const { code } = req.params

    // 先找到 plan_id
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('share_code', code)
      .maybeSingle()

    if (planError) {
      throw new Error(`查询行程失败: ${planError.message}`)
    }

    if (!plan) {
      res.status(404).json({ success: false, error: '行程不存在或分享码无效' })
      return
    }

    // 查询成员列表（按加入时间升序）
    const { data: members, error: membersError } = await supabaseAdmin
      .from('plan_preferences')
      .select('*')
      .eq('plan_id', plan.id)
      .order('created_at', { ascending: true })

    if (membersError) {
      throw new Error(`查询成员失败: ${membersError.message}`)
    }

    res.json({
      success: true,
      data: { members: (members || []) as PlanPreferenceRecord[] }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询成员失败'
    console.error('[plan/:code/members] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/plan/:code/member-count
 * 获取行程的协同成员数量（轻量接口，仅返回计数）
 */
shareRouter.get('/:code/member-count', async (req, res) => {
  try {
    const { code } = req.params

    // 先找到 plan_id
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('share_code', code)
      .maybeSingle()

    if (planError) {
      throw new Error(`查询行程失败: ${planError.message}`)
    }

    if (!plan) {
      res.status(404).json({ success: false, error: '行程不存在或分享码无效' })
      return
    }

    // 使用 head:true 仅获取计数，不拉取实际数据
    const { count, error: countError } = await supabaseAdmin
      .from('plan_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', plan.id)

    if (countError) {
      throw new Error(`查询成员数失败: ${countError.message}`)
    }

    res.json({
      success: true,
      data: { planId: plan.id, count: count || 0 }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询成员数失败'
    console.error('[plan/:code/member-count] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * DELETE /api/plan/:code
 * 删除行程（同时级联删除关联的 plan_preferences 记录）
 * query/body: userId - 行程所有者 id（用于权限校验）
 */
shareRouter.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params
    const bodyUserId = (req.body as { userId?: string } | undefined)?.userId
    const userId = req.user?.id || (req.query.userId as string | undefined) || bodyUserId

    if (!userId) {
      res.status(400).json({ success: false, error: '缺少 userId' })
      return
    }

    // 查询行程并校验归属
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id, user_id')
      .eq('share_code', code)
      .maybeSingle()

    if (planError) {
      throw new Error(`查询行程失败: ${planError.message}`)
    }

    if (!plan) {
      res.status(404).json({ success: false, error: '行程不存在或分享码无效' })
      return
    }

    if (plan.user_id !== userId) {
      res.status(403).json({ success: false, error: '无权删除该行程' })
      return
    }

    // 先删除关联的协同成员记录
    const { error: prefDeleteError } = await supabaseAdmin
      .from('plan_preferences')
      .delete()
      .eq('plan_id', plan.id)

    if (prefDeleteError) {
      throw new Error(`删除协同成员失败: ${prefDeleteError.message}`)
    }

    // 再删除行程本身
    const { error: planDeleteError } = await supabaseAdmin
      .from('plans')
      .delete()
      .eq('id', plan.id)

    if (planDeleteError) {
      throw new Error(`删除行程失败: ${planDeleteError.message}`)
    }

    res.json({ success: true, data: { planId: plan.id } })
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除行程失败'
    console.error('[plan/:code DELETE] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})

/**
 * PUT /api/plan/:code
 * 编辑行程（支持修改 title、status、plan_data、city、date、budget 等字段）
 * body: { userId, title?, status?, plan_data?, city?, date?, budget? }
 */
shareRouter.put('/:code', async (req, res) => {
  try {
    const { code } = req.params
    const { userId: bodyUserId, ...updates } = req.body as {
      userId?: string
      title?: string
      status?: 'draft' | 'active' | 'completed'
      plan_data?: Plan
      city?: string
      date?: string
      budget?: number
    }
    const userId = req.user?.id || bodyUserId

    if (!userId) {
      res.status(400).json({ success: false, error: '缺少 userId' })
      return
    }

    // 查询行程并校验归属
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id, user_id')
      .eq('share_code', code)
      .maybeSingle()

    if (planError) {
      throw new Error(`查询行程失败: ${planError.message}`)
    }

    if (!plan) {
      res.status(404).json({ success: false, error: '行程不存在或分享码无效' })
      return
    }

    if (plan.user_id !== userId) {
      res.status(403).json({ success: false, error: '无权编辑该行程' })
      return
    }

    // 构建更新字段（仅更新客户端实际提交的字段）
    const updateFields: Record<string, unknown> = {}
    if (updates.title !== undefined) updateFields.title = updates.title
    if (updates.status !== undefined) updateFields.status = updates.status
    if (updates.plan_data !== undefined) updateFields.plan_data = updates.plan_data
    if (updates.city !== undefined) updateFields.city = updates.city
    if (updates.date !== undefined) updateFields.date = updates.date
    if (updates.budget !== undefined) updateFields.budget = updates.budget

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({ success: false, error: '没有需要更新的字段' })
      return
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('plans')
      .update(updateFields)
      .eq('id', plan.id)
      .select('*')
      .single()

    if (updateError) {
      throw new Error(`更新行程失败: ${updateError.message}`)
    }

    res.json({ success: true, data: { plan: updated as PlanRecord } })
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新行程失败'
    console.error('[plan/:code PUT] 错误:', message)
    res.status(500).json({ success: false, error: message })
  }
})
