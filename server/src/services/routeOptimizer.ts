import type { PlanItem } from '../../../shared/types.js'
import { haversineDistance, hasValidCoord } from '../../../shared/utils.js'

/**
 * 路线优化模块
 * 基于最近邻（Nearest Neighbor）算法重排当日行程项，减少地图上的来回折返。
 * 原始时间顺序应由调用方在调用前保存到 DayPlan.originalItems。
 */

/**
 * 按地理最近邻原则重排 PlanItem 顺序
 * 以第一个点为起点，每次找距离当前点最近的未访问点
 * @param items 原始 PlanItem 数组
 * @returns 重排后的 PlanItem 数组（不修改原数组）
 */
export function reorderByNearest(items: PlanItem[]): PlanItem[] {
  // 边界：空数组
  if (!items || items.length === 0) {
    return []
  }

  // 边界：单个 item，直接返回新数组的浅拷贝
  if (items.length === 1) {
    return [...items]
  }

  // 拆分有坐标与无坐标的 items（保持原相对顺序）
  const withCoord: PlanItem[] = []
  const withoutCoord: PlanItem[] = []
  for (const item of items) {
    if (hasValidCoord(item.locationLng, item.locationLat)) {
      withCoord.push(item)
    } else {
      withoutCoord.push(item)
    }
  }

  // 有效坐标少于 2 个，无需优化，直接返回原数组的浅拷贝
  if (withCoord.length < 2) {
    return [...items]
  }

  // 最近邻重排
  const visited = new Array<boolean>(withCoord.length).fill(false)
  const ordered: PlanItem[] = []

  // 以第一个有效坐标的 item 为起点
  visited[0] = true
  ordered.push(withCoord[0])

  let currentIdx = 0
  for (let step = 1; step < withCoord.length; step++) {
    const current = withCoord[currentIdx]
    let nearestIdx = -1
    let nearestDist = Infinity

    for (let i = 0; i < withCoord.length; i++) {
      if (visited[i]) continue
      const candidate = withCoord[i]
      const dist = haversineDistance(
        current.locationLng as number,
        current.locationLat as number,
        candidate.locationLng as number,
        candidate.locationLat as number
      )
      if (dist < nearestDist) {
        nearestDist = dist
        nearestIdx = i
      }
    }

    // nearestIdx 必然被赋值（剩余未访问点至少一个）
    visited[nearestIdx] = true
    ordered.push(withCoord[nearestIdx])
    currentIdx = nearestIdx
  }

  // 无坐标的 items 追加到末尾（保持原相对顺序）
  return [...ordered, ...withoutCoord]
}
