import type { GeneratePlanRequest, WeatherInfo } from '@weekend-planner/shared'

/**
 * Prompt 构建逻辑
 */

/** 行程时长 -> 中文描述 */
const DURATION_LABEL: Record<GeneratePlanRequest['duration'], string> = {
  'half-day': '半天',
  '1-day': '1 天',
  '2-day': '2 天',
  '3-day': '3 天'
}

/** 出行方式 -> 中文描述 */
const TRANSPORT_LABEL: Record<GeneratePlanRequest['transport'], string> = {
  public: '公共交通（地铁/公交）',
  driving: '自驾',
  walking: '步行',
  mixed: '混合出行'
}

/**
 * 构建行程生成 Prompt
 * @param request 用户请求
 * @param weather 天气信息（可选）
 */
export function buildPlanPrompt(
  request: GeneratePlanRequest,
  weather?: WeatherInfo
): string {
  const {
    city,
    date,
    duration,
    budget,
    people,
    preferences,
    transport,
    multiUsers,
    adjustFrom
  } = request

  const lines: string[] = []
  lines.push('请为用户生成一份周末出行行程，要求如下：')
  lines.push('')
  lines.push('## 一、用户需求')
  lines.push(`- 城市：${city}`)
  lines.push(`- 出发日期：${date}`)
  lines.push(`- 行程时长：${DURATION_LABEL[duration]}`)
  lines.push(`- 预算：${budget} 元（人民币）`)
  const safePeople = Number.isFinite(people) && people > 0 ? people : 1
  lines.push(`- 人数：${safePeople} 人`)
  lines.push(`- 偏好：${preferences.join('、') || '不限'}`)
  lines.push(`- 出行方式：${TRANSPORT_LABEL[transport]}`)

  // 多人偏好
  if (multiUsers && multiUsers.length > 0) {
    lines.push('')
    lines.push('## 二、同行人偏好')
    multiUsers.forEach((u, idx) => {
      lines.push(
        `- 同行人 ${idx + 1}（${u.nickname}）：${u.preferences.join('、') || '不限'}`
      )
    })
    lines.push('请在行程中兼顾每位同行人的偏好，尽量满足多数人的需求。')
  }

  // 天气信息
  if (weather) {
    lines.push('')
    lines.push('## 三、天气信息')
    lines.push(`- 天气状况：${weather.condition}`)
    lines.push(`- 温度：${weather.temperature}`)
    lines.push(`- 出行建议：${weather.suggestion}`)
    lines.push('请结合天气情况调整行程安排，例如雨天优先室内活动。')
  }

  // 调整来源（如果是基于已有行程调整）
  if (adjustFrom) {
    lines.push('')
    lines.push('## 四、调整说明')
    lines.push(`用户希望基于以下内容进行调整：${adjustFrom}`)
    lines.push('请在保留原有行程优点的基础上，根据本次需求进行优化。')
  }

  // 输出要求
  lines.push('')
  lines.push('## 输出要求')
  lines.push('1. 必须输出一个合法的 JSON 对象，不要包含任何解释性文字、Markdown 代码块标记或注释。')
  lines.push('2. JSON 结构必须严格符合以下 TypeScript 类型：')
  lines.push('')
  lines.push('```typescript')
  lines.push('interface Plan {')
  lines.push('  id: string                  // 行程 ID，使用占位符 "placeholder"')
  lines.push('  city: string                // 城市名')
  lines.push('  title: string               // 行程标题（简洁有吸引力）')
  lines.push('  summary: string             // 行程概要（100 字以内）')
  lines.push('  days: DayPlan[]             // 按天组织的行程')
  lines.push('  totalCost: number           // 行程总花费（元）')
  lines.push('  budget: number              // 用户预算')
  lines.push('  checklist: PlanChecklist    // 出行清单')
  lines.push('  weather?: WeatherInfo       // 天气信息（如有）')
  lines.push('}')
  lines.push('')
  lines.push('interface DayPlan {')
  lines.push('  day: number                 // 第几天，从 1 开始')
  lines.push('  date: string               // 日期（YYYY-MM-DD）')
  lines.push('  items: PlanItem[]          // 当天行程项')
  lines.push('  totalCost: number          // 当天总花费')
  lines.push('}')
  lines.push('')
  lines.push('interface PlanItem {')
  lines.push('  id: string                 // 唯一标识，格式 dayN-itemM（如 day1-item1）')
  lines.push('  time: string               // 开始时间（HH:mm）')
  lines.push('  endTime?: string           // 结束时间（HH:mm）')
  lines.push('  title: string              // 行程项名称')
  lines.push('  location: string           // 地点名称')
  lines.push('  address?: string           // 详细地址')
  lines.push('  description: string        // 行程描述（推荐理由、亮点）')
  lines.push('  cost: number               // 单项花费（元）')
  lines.push('  duration: string           // 时长描述（如 "1.5 小时"）')
  lines.push('  transport?: string         // 前往下一个地点的交通方式')
  lines.push('  alternatives?: string[]    // 备选方案')
  lines.push('  tips?: string              // 小贴士')
  lines.push('  locationLng: number        // 经度（必填，必须真实准确）')
  lines.push('  locationLat: number        // 纬度（必填，必须真实准确）')
  lines.push('}')
  lines.push('')
  lines.push('interface PlanChecklist {')
  lines.push('  items: string[]            // 必备物品清单')
  lines.push('  reminders: string[]        // 注意事项')
  lines.push('  mapLinks: string[]         // 高德地图链接（可留空数组）')
  lines.push('}')
  lines.push('')
  lines.push('interface WeatherInfo {')
  lines.push('  condition: string          // 天气状况')
  lines.push('  temperature: string        // 温度描述')
  lines.push('  suggestion: string         // 出行建议')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('## 常见城市经纬度范围参考')
  lines.push('坐标必须落在对应城市的实际地理范围内，参考如下：')
  lines.push('- 北京：经度 116.0-116.8，纬度 39.6-40.1')
  lines.push('- 上海：经度 120.8-121.9，纬度 30.7-31.4')
  lines.push('- 广州：经度 113.0-113.7，纬度 22.5-23.4')
  lines.push('- 深圳：经度 113.7-114.5，纬度 22.4-22.9')
  lines.push('- 杭州：经度 120.0-120.5，纬度 30.0-30.4')
  lines.push('- 成都：经度 103.9-104.2，纬度 30.5-30.7')
  lines.push('- 西安：经度 108.9-109.0，纬度 34.2-34.4')
  lines.push('- 重庆：经度 106.3-106.7，纬度 29.0-29.7')
  lines.push('- 武汉：经度 114.1-114.5，纬度 30.4-30.7')
  lines.push('- 南京：经度 118.6-119.2，纬度 31.9-32.6')
  lines.push('其他城市请根据实际地理位置输出合理坐标。')
  lines.push('')
  lines.push('## 内容质量要求')
  lines.push('1. 行程安排要合理，时间紧凑但不赶场，留有休息时间。')
  lines.push('2. 地点之间距离合理，避免来回奔波。')
  lines.push('3. 每个行程项的描述要具体、有吸引力，避免空泛。')
  lines.push('4. 总花费控制在预算范围内，并尽量贴近预算上限以提升体验。')
  lines.push('5. checklist.items 要结合天气、出行方式、兴趣给出实用建议。')
  lines.push('6. days 数组的长度要与行程时长匹配（half-day 和 1-day 为 1 天，2-day 为 2 天，3-day 为 3 天）。')
  lines.push('7. 日期要基于上述出发日期顺延计算。')
  lines.push('8. 所有地点的 locationLng 和 locationLat 必须真实准确，不能编造。如果不确定精确坐标，请给出该地点所在区域的大致坐标。')
  lines.push('')
  lines.push('请直接输出 JSON 对象，不要有任何前后缀文字。')

  return lines.join('\n')
}
