import { Router } from 'express'
import type { GeneratePlanRequest } from '@weekend-planner/shared'

export const planRouter = Router()

/**
 * POST /api/plan/generate
 * 生成周末行程（SSE 流式响应）
 */
planRouter.post('/generate', async (req, res) => {
  try {
    const body = req.body as GeneratePlanRequest

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    // 发送 meta 事件
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    res.write(`event: meta\ndata: ${JSON.stringify({ planId, createdAt: new Date().toISOString() })}\n\n`)

    // TODO: 实现天气查询、AI 生成、POI 搜索
    // 当前为占位逻辑
    res.write(`event: chunk\ndata: ${JSON.stringify({ content: '正在生成行程...\n\n' })}\n\n`)

    // 模拟生成完成
    setTimeout(() => {
      res.write(`event: done\ndata: ${JSON.stringify({ plan: { id: planId, city: body.city, title: '示例行程', summary: '待实现', days: [], totalCost: 0, budget: body.budget, checklist: { items: [], reminders: [], mapLinks: [] } } })}\n\n`)
      res.end()
    }, 1000)
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成失败'
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
    res.end()
  }
})
