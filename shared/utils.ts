/**
 * 共享工具函数（前后端通用）
 */

/**
 * 使用 Haversine 公式计算两个经纬度点之间的球面距离（km）
 */
export function haversineDistance(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const R = 6371 // 地球半径 km
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 校验坐标是否为有效的中国境内坐标
 * 过滤 null/undefined/0，校验经度 73-135、纬度 18-53
 */
export function isValidChinaCoordinate(
  lng: number | undefined | null,
  lat: number | undefined | null
): boolean {
  if (lng == null || lat == null) return false
  if (lng === 0 || lat === 0) return false
  if (lng < 73 || lng > 135) return false
  if (lat < 18 || lat > 53) return false
  return true
}

/**
 * 判断 PlanItem 是否拥有有效坐标（不为 null/undefined，且不为 0）
 * 注意：不校验中国境内范围，仅校验非空非零
 */
export function hasValidCoord(
  lng: number | undefined | null,
  lat: number | undefined | null
): boolean {
  return lng != null && lat != null && lng !== 0 && lat !== 0
}
