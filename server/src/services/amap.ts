import { config } from '../config.js'
import type { WeatherInfo } from '@weekend-planner/shared'

/**
 * 高德 Web 服务 API 封装
 * 文档：https://lbs.amap.com/api/webservice/summary
 */

const AMAP_BASE = 'https://restapi.amap.com/v3'

/** 高德 POI 类型 */
export interface POI {
  id: string
  name: string
  type: string
  address: string
  location: string // "经度,纬度"
  tel: string
}

/** 高德地理编码返回的 adcode 缓存（按城市名） */
const adcodeCache = new Map<string, string>()

/**
 * 发起高德 API 请求
 */
async function amapRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${AMAP_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  url.searchParams.set('key', config.amap.serverKey)

  // 每个请求独立的 AbortController，超时 8s 兜底网络抖动
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })

    if (!res.ok) {
      throw new Error(`高德 API 请求失败: HTTP ${res.status}`)
    }

    const data = (await res.json()) as T & { status?: string; info?: string; infocode?: string }

    // 高德 API 用 status 字段表示业务是否成功（"1" 成功）
    if (data.status && data.status !== '1') {
      throw new Error(`高德 API 业务错误: ${data.info || ''} (${data.infocode || ''})`)
    }

    return data as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('高德 API 请求超时（8s）')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 地理编码：城市名 -> adcode
 * @param city 城市名（如 "北京"、"上海市"）
 */
export async function geocode(city: string): Promise<{ adcode: string }> {
  // 命中缓存
  const cached = adcodeCache.get(city)
  if (cached) return { adcode: cached }

  const data = await amapRequest<{
    geocodes?: Array<{ adcode: string }>
  }>('/geocode/geo', { address: city })

  const adcode = data.geocodes?.[0]?.adcode
  if (!adcode) {
    throw new Error(`无法获取城市 "${city}" 的行政区编码`)
  }

  adcodeCache.set(city, adcode)
  return { adcode }
}

/**
 * 地理编码：返回完整信息（包括坐标）
 * 与 geocode 的区别：geocode 只返回 adcode，本函数返回 location
 */
export async function geocodeWithLocation(
  address: string
): Promise<{ lng: number; lat: number; adcode: string } | null> {
  try {
    const data = await amapRequest<{
      status?: string
      geocodes?: Array<{ location?: string; adcode?: string }>
    }>('/geocode/geo', { address })
    if (data.status !== '1') return null
    const geo = data.geocodes?.[0]
    if (!geo?.location) return null
    const parts = geo.location.split(',').map(Number)
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return null
    }
    return {
      lng: parts[0],
      lat: parts[1],
      adcode: geo.adcode ?? ''
    }
  } catch {
    return null
  }
}

/**
 * 查询城市天气（含预报）
 * @param city 城市名
 */
export async function getWeather(city: string): Promise<WeatherInfo> {
  const { adcode } = await geocode(city)

  const data = await amapRequest<{
    forecasts?: Array<{
      casts?: Array<{
        dayweather: string
        nighttemp: string
        daytemp: string
        daywind: string
        daypower: string
      }>
    }>
  }>('/weather/weatherInfo', {
    city: adcode,
    extensions: 'all'
  })

  const cast = data.forecasts?.[0]?.casts?.[0]
  if (!cast) {
    throw new Error(`无法获取城市 "${city}" 的天气信息`)
  }

  // 根据天气情况生成出行建议
  const condition = cast.dayweather
  const temperature = `${cast.daytemp}°C / ${cast.nighttemp}°C`
  const suggestion = buildWeatherSuggestion(condition, cast.daywind, cast.daypower)

  return { condition, temperature, suggestion }
}

/**
 * 根据天气状况生成出行建议
 */
function buildWeatherSuggestion(weather: string, wind: string, power: string): string {
  const w = weather.toLowerCase()
  let suggestion = ''

  if (/雨/.test(weather)) {
    suggestion = '今日有雨，建议携带雨具，优先选择室内活动或带有遮蔽的景点。'
  } else if (/雪/.test(weather)) {
    suggestion = '今日有雪，注意保暖与防滑，建议选择室内活动，外出注意交通安全。'
  } else if (/雾|霾/.test(weather)) {
    suggestion = '今日有雾/霾，建议佩戴口罩，减少长时间户外活动。'
  } else if (/晴/.test(weather)) {
    suggestion = '今日天气晴朗，适合户外活动，注意防晒与补水。'
  } else if (/云|阴/.test(weather)) {
    suggestion = '今日多云/阴天，气温适宜，户外与室内活动均可。'
  } else {
    suggestion = '今日天气一般，建议根据实际体感灵活安排行程。'
  }

  // 风力较大时补充提示
  const powerNum = parseInt(power, 10)
  if (!Number.isNaN(powerNum) && powerNum >= 5) {
    suggestion += ` 今日风力较大（${wind}风 ${power}级），请注意避风。`
  }

  return suggestion
}

/**
 * POI 搜索
 * @param keyword 关键词（如 "故宫"）
 * @param city 城市名
 * @param limit 返回条数，默认 5，最多 20
 */
export async function searchPOI(
  keyword: string,
  city: string,
  limit: number = 5
): Promise<POI[]> {
  // 限制在 1-20 之间
  const cappedLimit = Math.max(1, Math.min(20, Math.floor(limit)))
  const data = await amapRequest<{
    pois?: Array<{
      id: string
      name: string
      type: string
      address: string
      location: string
      tel: string
    }>
  }>('/place/text', {
    keywords: keyword,
    city,
    offset: String(cappedLimit)
  })

  return (data.pois || []).map((p) => ({
    id: p.id ?? '',
    name: p.name ?? '',
    type: p.type ?? '',
    address: p.address ?? '',
    location: p.location ?? '',
    tel: p.tel ?? ''
  }))
}
