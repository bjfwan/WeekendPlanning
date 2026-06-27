import { Router, type Response } from 'express'
import type { GeneratePlanRequest, Plan, PlanItem, WeatherInfo } from '@weekend-planner/shared'
import { generatePlanStream } from '../services/ai.js'
import { getWeather, geocodeWithLocation, searchPOI } from '../services/amap.js'
import { buildPlanPrompt } from '../services/prompt.js'
import { reorderByNearest } from '../services/routeOptimizer.js'
import { haversineDistance, isValidChinaCoordinate } from '../../../shared/utils.js'

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
    weather: obj.weather,
    transport: obj.transport ?? fallback.transport
  }
}

/**
 * 解析高德 location 字符串 "经度,纬度" 为 [lng, lat]
 */
function parseLocation(loc: string): [number, number] | null {
  if (!loc) return null
  const parts = loc.split(',').map(Number)
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null
  return [parts[0], parts[1]]
}

/**
 * 从 location 和 title 中提取关键词（长度 >= 2 的片段）
 */
function extractKeywords(location: string, title: string): string[] {
  const keywords = new Set<string>()
  const cleanText = (text: string) =>
    text
      .replace(/[（(].*?[)）]/g, '') // 移除括号内容
      .replace(/[，,。.、！!？?；;：:]/g, ' ') // 标点转空格
      .trim()

  const locClean = cleanText(location)
  const titleClean = cleanText(title)

  for (const part of locClean.split(/\s+/)) {
    if (part.length >= 2) keywords.add(part)
  }
  for (const part of titleClean.split(/\s+/)) {
    if (part.length >= 2) keywords.add(part)
  }

  return Array.from(keywords)
}

/**
 * 名称匹配分（0-1）
 * - 完全包含：1.0
 * - 部分匹配（有共同关键词）：0.5-0.8
 * - 不匹配：0
 */
function calcNameScore(poiName: string, itemLocation: string, itemTitle: string): number {
  if (!poiName) return 0
  const name = poiName.toLowerCase()
  const loc = itemLocation.toLowerCase()
  const title = itemTitle.toLowerCase()

  // 完全包含
  if (loc && (name.includes(loc) || loc.includes(name))) return 1.0
  if (title && (name.includes(title) || title.includes(name))) return 1.0

  // 部分匹配：基于关键词包含判断
  const keywords = extractKeywords(itemLocation, itemTitle)
  if (keywords.length === 0) return 0

  let matchCount = 0
  for (const kw of keywords) {
    if (kw && name.includes(kw.toLowerCase())) matchCount++
  }

  if (matchCount === 0) return 0
  // 部分匹配给 0.5-0.8 分，按匹配比例递增
  const ratio = matchCount / keywords.length
  return 0.5 + 0.3 * ratio
}

/**
 * 类型匹配分（0-1）
 * 根据 POI.type 字段判断是否与行程性质匹配
 */
function calcTypeScore(poiType: string, itemTitle: string, itemDescription: string): number {
  if (!poiType) return 0.5

  const type = poiType
  const text = `${itemTitle} ${itemDescription}`

  // 餐饮类
  if (/餐|吃|饭|美食|小吃|早餐|午餐|晚餐|宵夜|饭店|餐厅/.test(text)) {
    if (/餐饮|餐厅|美食|小吃/.test(type)) return 1.0
    return 0.3
  }

  // 风景名胜类
  if (/景|公园|博物馆|名胜|古迹|寺庙|广场|塔|湖|山|园/.test(text)) {
    if (/风景名胜|公园|博物馆|文物|宗教/.test(type)) return 1.0
    return 0.3
  }

  // 购物类
  if (/买|购物|商场|超市|市场|街/.test(text)) {
    if (/购物|商场|市场|超市/.test(type)) return 1.0
    return 0.3
  }

  // 住宿类
  if (/住|酒店|宾馆|民宿|客栈/.test(text)) {
    if (/住宿|酒店|宾馆/.test(type)) return 1.0
    return 0.3
  }

  // 默认 0.5
  return 0.5
}

/**
 * 距离分（0-1）
 * - 无上一个点参考（当天第一个有坐标的 item）：固定 0.5
 * - 距离 > 50km：0 分
 * - 距离归一化：max(0, 1 - distance / 50)
 */
function calcDistanceScore(
  poiLng: number,
  poiLat: number,
  prevLng: number | undefined,
  prevLat: number | undefined
): number {
  if (prevLng === undefined || prevLat === undefined) return 0.5

  const distance = haversineDistance(prevLng, prevLat, poiLng, poiLat)
  if (distance > 50) return 0
  return Math.max(0, 1 - distance / 50)
}

/**
 * 确保所有 PlanItem 都有稳定且唯一的 id
 * - AI 可能不输出 id，或输出不规范的 id
 * - 同一天内重复的 id 追加序号去重
 * - 无 id 时按 dayN-itemM 规则生成
 */
function ensureItemIds(plan: Plan): void {
  for (let dayIdx = 0; dayIdx < plan.days.length; dayIdx++) {
    const day = plan.days[dayIdx]
    const seenIds = new Set<string>()
    for (let itemIdx = 0; itemIdx < day.items.length; itemIdx++) {
      const item = day.items[itemIdx]
      if (!item.id || seenIds.has(item.id)) {
        item.id = `day${dayIdx + 1}-item${itemIdx + 1}`
      }
      seenIds.add(item.id)
    }
  }
}

/**
 * 用高德 POI 搜索补充行程项的真实坐标（赋分制度）
 * AI 返回的坐标不准确，这里用真实坐标覆盖
 *
 * 赋分维度：
 * - 距离分（40%）：到上一个有 AI 坐标的 item 的距离（并发模式下用 AI 坐标近似参考点）
 * - 名称匹配分（40%）：POI.name 与 item.location/title 的相似度
 * - 类型匹配分（20%）：POI.type 与行程性质的匹配度
 *
 * 坐标校验：过滤 (0,0)，校验中国境内范围，失败保留 AI 原始坐标
 * 地点去重：同一天内相同 location 只搜索一次，结果回填到所有相同 location 的 items
 *
 * 全并发处理：先收集唯一 location，对所有唯一 location 并发搜索 POI
 * （高德 Web 服务 Key QPS 足够支持，个人开发者 500 QPS，企业 3000 QPS）
 * 失败不影响主流程，仅保留 AI 返回的原始坐标
 */
async function enrichPlanItems(
  plan: Plan,
  res: Response,
  isClosed: () => boolean
): Promise<void> {
  // 预计算所有日期的唯一 location 总数，用于进度反馈
  let total = 0
  for (const day of plan.days) {
    const dayUnique = new Set<string>()
    for (const item of day.items) {
      if (item.location) dayUnique.add(item.location)
    }
    total += dayUnique.size
  }

  let current = 0

  for (const day of plan.days) {
    const items = day.items

    // 保存原始时间顺序的 items 引用（浅拷贝：数组为新引用，元素仍指向同一对象）
    // 坐标会在 enrichment 后更新为真实坐标，originalItems 中的元素同步更新
    // 前端 'time' 模式使用此字段，获取"原始时间顺序 + 真实坐标"
    day.originalItems = [...items]

    // 1. 收集当天所有唯一 location（保持首次出现顺序）
    //    同时为每个 location 计算距离参考点（向前查找第一个有有效 AI 坐标的 item）
    const uniqueLocations = new Map<
      string,
      {
        items: PlanItem[]
        prevLng: number | undefined
        prevLat: number | undefined
      }
    >()

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.location) continue

      if (!uniqueLocations.has(item.location)) {
        // 向前查找第一个有有效 AI 坐标的 item 作为距离参考点
        let prevLng: number | undefined
        let prevLat: number | undefined
        for (let j = i - 1; j >= 0; j--) {
          const prev = items[j]
          if (
            prev.locationLng !== undefined &&
            prev.locationLat !== undefined &&
            isValidChinaCoordinate(prev.locationLng, prev.locationLat)
          ) {
            prevLng = prev.locationLng
            prevLat = prev.locationLat
            break
          }
        }
        uniqueLocations.set(item.location, { items: [], prevLng, prevLat })
      }
      uniqueLocations.get(item.location)!.items.push(item)
    }

    // 2. 对每个唯一 location 并发搜索 POI（全并发，提高吞吐）
    const locationEntries = Array.from(uniqueLocations.entries())
    await Promise.all(
      locationEntries.map(
        async ([location, { items: itemsWithLocation, prevLng, prevLat }]) => {
          const representative = itemsWithLocation[0]
          let resolved = false

          try {
            const pois = await searchPOI(location, plan.city, 5)

            if (pois.length > 0) {
              let bestScore = -1
              let bestLng: number | null = null
              let bestLat: number | null = null

              for (const poi of pois) {
                const parsed = parseLocation(poi.location)
                if (!parsed) continue
                const [poiLng, poiLat] = parsed

                // 坐标校验
                if (!isValidChinaCoordinate(poiLng, poiLat)) continue

                const distanceScore = calcDistanceScore(poiLng, poiLat, prevLng, prevLat)
                const nameScore = calcNameScore(poi.name, location, representative.title)
                const typeScore = calcTypeScore(
                  poi.type,
                  representative.title,
                  representative.description
                )

                const totalScore = distanceScore * 0.4 + nameScore * 0.4 + typeScore * 0.2

                if (totalScore > bestScore) {
                  bestScore = totalScore
                  bestLng = poiLng
                  bestLat = poiLat
                }
              }

              if (bestLng !== null && bestLat !== null) {
                // 回填到所有相同 location 的 items
                for (const it of itemsWithLocation) {
                  it.locationLng = bestLng
                  it.locationLat = bestLat
                }
                resolved = true
              } else {
                console.warn(`[enrichPlanItems] 所有 POI 坐标校验失败: ${location}`)
              }
            }
          } catch (err) {
            // POI 搜索失败仅打印警告，不阻断主流程
            console.warn(
              `[enrichPlanItems] POI 搜索失败: ${location}`,
              err instanceof Error ? err.message : err
            )
          }

          // POI 搜索失败或无有效坐标 → 检查 AI 原始坐标，无效则 geocode 兜底
          if (!resolved) {
            const aiLng = representative.locationLng
            const aiLat = representative.locationLat
            if (
              aiLng !== undefined &&
              aiLat !== undefined &&
              isValidChinaCoordinate(aiLng, aiLat)
            ) {
              // AI 原始坐标有效，保留即可
              return
            }

            // AI 原始坐标也无效 → geocode 兜底
            const geocoded = await geocodeWithLocation(`${plan.city}${location}`)
            if (geocoded) {
              for (const it of itemsWithLocation) {
                it.locationLng = geocoded.lng
                it.locationLat = geocoded.lat
              }
            } else {
              console.warn(`[enrichPlanItems] geocode 兜底也失败，放弃: ${location}`)
            }
          }
        }
      ).map((promise, idx) => {
        const [location] = locationEntries[idx]
        return promise.finally(() => {
          current++
          if (!isClosed()) {
            sendSSE(res, 'progress', { current, total, location })
          }
        })
      })
    )

    // 重排 items（按最近邻）
    try {
      day.items = reorderByNearest(day.items)
    } catch (err) {
      console.warn(
        `[enrichPlanItems] 重排 items 失败:`,
        err instanceof Error ? err.message : err
      )
    }
  }
}

/**
 * POST /api/plan/generate
 * 生成周末行程（SSE 流式响应）
 */
planRouter.post('/generate', async (req, res) => {
  // 标记连接是否已断开
  let closed = false
  // 使用 res.on('close') 而非 req.on('close')，因为后者可能在请求体接收完成时就触发
  res.on('close', () => {
    closed = true
  })

  try {
    const body = req.body as GeneratePlanRequest

    // 校验 people：确保是 >=1 的有效数字
    const peopleNum = Number(body.people)
    body.people = Number.isFinite(peopleNum) && peopleNum >= 1 ? Math.min(peopleNum, 10) : 1

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

    // 总预算保护：Vercel Serverless 函数 60s 超时，留 10s 余量给 enrichment + done + 网络往返
    const startTime = Date.now()
    const TOTAL_BUDGET_MS = 50_000

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
      fullText = await generatePlanStream(
        prompt,
        (content) => {
          if (closed) return
          sendSSE(res, 'chunk', { content })
        },
        body.userConfig,
        (content) => {
          if (closed) return
          sendSSE(res, 'reasoning', { content })
        }
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 生成失败'
      console.error('[plan/generate] AI 生成失败:', message)
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
        budget: body.budget,
        transport: body.transport
      })

      // 6. 用高德 POI 搜索补充真实坐标，覆盖 AI 编造的坐标
      // 总预算保护：若 AI 阶段已用满时间，跳过 enrichment 直接用 AI 坐标发 done
      const elapsed = Date.now() - startTime
      const enrichSkipped = elapsed > TOTAL_BUDGET_MS
      if (enrichSkipped) {
        console.warn(`总耗时已超 ${TOTAL_BUDGET_MS / 1000}s（实际 ${elapsed}ms），跳过坐标补充以避免 Vercel 超时`)
      }

      if (!closed && !enrichSkipped) {
        sendSSE(res, 'status', { message: '正在补充地图坐标...' })
      }
      // 先确保所有 item 都有稳定唯一的 id（AI 可能不输出或输出重复 id）
      ensureItemIds(plan)
      if (!enrichSkipped) {
        try {
          await enrichPlanItems(plan, res, () => closed)
        } catch (err) {
          // 坐标补充失败不影响主流程，仅打印警告
          console.warn(
            '[plan/generate] 坐标补充失败:',
            err instanceof Error ? err.message : err
          )
        }
      }

      if (!closed) {
        sendSSE(res, 'done', { plan, enrichSkipped })
      }
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
