import { Router, type Response } from 'express'
import type { GeneratePlanRequest, Plan, WeatherInfo } from '@weekend-planner/shared'
import { generatePlanStream } from '../services/ai.js'
import { getWeather } from '../services/amap.js'
import { buildPlanPrompt } from '../services/prompt.js'

export const planRouter = Router()

/**
 * 发送 SSE 事件
 */
function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/**
 * 清理 AI 返回文本中的 Markdown 代码块标记
 */
function cleanMarkdownJSON(text: string): string {
  let cleaned = text.trim()
  // 移除开头的 ```json 或 ```
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  // 移除结尾的 ```
  cleaned = cleaned.replace(/\n?```\s*$/i, '')
  return cleaned.trim()
}

/**
 * 从 AI 返回文本中提取 JSON 对象
 * 兼容 AI 偶尔在 JSON 前后输出解释性文字的情况
 */
function extractJSON(text: string): string {
  let cleaned = cleanMarkdownJSON(text)

  // 如果还存在非 JSON 内容，尝试截取第一个 { 到最后一个 }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  return cleaned
}

/**
 * 解析 AI 返回的文本为 Plan 对象
 */
function parsePlan(text: string, planId: string, fallback: Partial<Plan>): Plan {
  const jsonStr = extractJSON(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    throw new Error('AI 返回的内容无法解析为 JSON')
  }

  const obj = parsed as Partial<Plan>
  return {
    id: planId,
    city: obj.city ?? fallback.city ?? '',
    title: obj.title ?? '周末行程',
    summary: obj.summary ?? '',
    days: Array.isArray(obj.days) ? obj.days : [],
    totalCost: typeof obj.totalCost === 'number' ? obj.totalCost : 0,
    budget: typeof obj.budget === 'number' ? obj.budget : fallback.budget ?? 0,
    checklist: obj.checklist ?? { items: [], reminders: [], mapLinks: [] },
    weather: obj.weather
  }
}

/**
 * POST /api/plan/generate
 * 生成周末行程（SSE 流式响应）
 */
planRouter.post('/generate', async (req, res) => {
  // 标记连接是否已断开
  let closed = false
  req.on('close', () => {
    closed = true
  })

  try {
    const body = req.body as GeneratePlanRequest

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // 禁用 nginx 缓冲，确保实时推送
    })

    // 1. 生成 planId 并发送 meta 事件
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const createdAt = new Date().toISOString()
    sendSSE(res, 'meta', { planId, createdAt })

    // 2. 异步查询天气（不阻塞主流程）
    let weather: WeatherInfo | undefined
    try {
      weather = await getWeather(body.city)
    } catch (err) {
      // 天气查询失败不影响主流程
      console.warn('[plan/generate] 天气查询失败:', err instanceof Error ? err.message : err)
    }

    // 3. 构建 Prompt
    const prompt = buildPlanPrompt(body, weather)

    if (closed) return

    // 4. 调用 AI 服务，流式输出 chunk
    let fullText = ''
    try {
      fullText = await generatePlanStream(prompt, (content) => {
        if (closed) return
        sendSSE(res, 'chunk', { content })
      }, body.userConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 生成失败'
      if (!closed) {
        sendSSE(res, 'error', { message })
        res.end()
      }
      return
    }

    if (closed) return

    // 5. 解析 AI 返回的 JSON，发送 done 事件
    try {
      const plan = parsePlan(fullText, planId, {
        city: body.city,
        budget: body.budget
      })
      sendSSE(res, 'done', { plan })
    } catch (err) {
      // JSON 解析失败兜底：返回原始文本作为 chunk，并发送 error 事件
      const message = err instanceof Error ? err.message : '行程解析失败'
      sendSSE(res, 'error', { message, code: 'PARSE_FAILED' })
    }

    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成失败'
    if (!closed) {
      try {
        sendSSE(res, 'error', { message })
      } catch {
        // 响应头可能尚未发送，尝试普通 JSON 错误
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: message })
        }
      }
      res.end()
    }
  }
})
