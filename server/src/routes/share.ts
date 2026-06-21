import { Router } from 'express'
import { randomBytes } from 'crypto'
import type { Plan, PlanPreferenceRecord, PlanRecord } from '@weekend-planner/shared'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

export const shareRouter = Router()

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
 * POST /api/plan/save
 * 保存行程并生成分享码
 */
shareRouter.post('/save', async (req, res) => {
  try {
    const { plan, userId } = req.body as { plan: Plan; userId: string }

    if (!plan || !userId) {
      res.status(400).json({ success: false, error: '缺少 plan 或 userId' })
      return
    }

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
          duration: '',
          budget: plan.budget,
          people: 0,
          mood: [],
          interests: [],
          transport: '',
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
 * query: userId - 当前匿名用户 id
 */
shareRouter.get('/history', async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined

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
