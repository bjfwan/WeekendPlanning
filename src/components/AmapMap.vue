<script setup lang="ts">
/**
 * 高德地图组件（专业版）
 * - 数字标记（起点 coral / 中间 amber / 终点 mint），上方显示时间
 * - 路线规划（公交 / 自驾 / 步行 / 直线），含白色描边 + coral 主线
 * - 交通方式切换浮层（右上角，规划中显示 loading）
 * - 公交/地铁信息面板（左下角，区分地铁/公交/步行）
 * - 暴露 focusPoint 方法（聚焦 + InfoWindow + 弹跳动画）
 */
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue'
import { loadAMap, type MapPoint, type TransportOption } from '@/composables/useAmap'
import type { TransportMode } from '@weekend-planner/shared'

/** 公交/地铁路线分段信息 */
interface RouteSegment {
  /** 坐标点数组 */
  path: any[]
  /** 段类型：transit（公交/地铁）或 walking（步行） */
  type: 'transit' | 'walking'
  /** transit_mode: 'BUS' | 'SUBWAY'（仅 transit 段有） */
  mode?: string
  /** 线路名称（如"地铁1号线"、"公交301路"，仅 transit 段有） */
  name?: string
}

/** 可动画的路线层（记录完整路径，用于渐进式绘制动画） */
interface AnimatableLayer {
  layer: any
  targetOpacity: number
  /** 完整路径点数组，动画中逐步截取显示 */
  fullPath: any[]
}

/** 公交/地铁路线信息组（用于信息面板展示） */
interface TransitInfoGroup {
  /** 起点标记索引 */
  fromIndex: number
  /** 终点标记索引 */
  toIndex: number
  /** 该段路线的交通方式明细 */
  items: Array<{
    type: 'transit' | 'walking'
    mode?: string
    name?: string
  }>
}

interface Props {
  /** POI 点列表 */
  points: MapPoint[]
  /** 交通方式：'public'|'driving'|'walking'|'mixed'，默认 'mixed' */
  transport?: TransportMode
  /** 地图高度，默认 '400px' */
  height?: string
  /** 公交换乘城市，默认 '北京' */
  city?: string
  /** 上一日终点的坐标，用于画跨日虚线（null/undefined 表示不画） */
  crossDayPoint?: { lng: number; lat: number } | null
}

const props = withDefaults(defineProps<Props>(), {
  transport: 'mixed',
  height: '400px',
  city: '北京'
})

const emit = defineEmits<{
  /** 点击标记时触发，传出点的 index */
  pointClick: [index: number]
}>()

// ========== 响应式状态 ==========
const mapContainer = ref<HTMLDivElement | null>(null)
/** 地图 SDK 加载中 */
const loading = ref(true)
/** 地图加载错误信息 */
const errorMsg = ref<string | null>(null)
/** 当前交通方式（本地状态，可被用户切换） */
const currentTransport = ref<TransportMode>(props.transport)
/** 路线规划中（用于按钮 loading） */
const planning = ref(false)
/** 路线交通方式信息（仅 public 模式有值，用于信息面板） */
const transitInfo = ref<TransitInfoGroup[]>([])

// ========== 内部实例（shallowRef 避免深度代理 AMap 大对象） ==========
const AMap = shallowRef<any>(null)
const map = shallowRef<any>(null)
/** 跨日虚线引用（独立于 routeLayers，避免被 clearRoute 清理） */
const crossDayLineRef = shallowRef<any>(null)

// 标记、路线层、信息窗等内部集合不需要响应式，用普通变量即可（不会被 Vue 代理）
let markers: any[] = []
let routeLayers: any[] = []
let infoWindow: any = null
/** 路线规划会话 ID，用于取消旧的规划请求 */
let planSessionId = 0
/** 导航插件是否已加载 */
let pluginsReady = false

/** 路线分段组（每组对应两个相邻标记之间的一段路线，用于逐段动画） */
let routeSegmentGroups: AnimatableLayer[][] = []
/** 当前正在绘制的分段组（null 表示不在分组模式，路线创建后立即可见） */
let currentSegmentGroup: AnimatableLayer[] | null = null

// ========== 常量 ==========
const COLOR_CORAL = '#FF6B6B'
const COLOR_AMBER = '#FFD93D'
const COLOR_MINT = '#4ECDC4'
const COLOR_SUBWAY = '#3B82F6'
const COLOR_WALK = '#999999'

// ========== 交通方式选项 ==========
const transportOptions: TransportOption[] = [
  { mode: 'public', icon: '🚌', label: '公交' },
  { mode: 'driving', icon: '🚗', label: '自驾' },
  { mode: 'walking', icon: '🚶', label: '步行' },
  { mode: 'mixed', icon: '📍', label: '直线' }
]

// ========== 标记相关 ==========

/**
 * 根据点的序号获取标记颜色
 * - 第一个点：coral（起点）
 * - 最后一个点：mint（终点）
 * - 中间点：amber
 */
function getPointColor(idx: number): string {
  const total = props.points.length
  if (total <= 1) return COLOR_CORAL
  if (idx === 0) return COLOR_CORAL
  if (idx === total - 1) return COLOR_MINT
  return COLOR_AMBER
}

/**
 * 创建数字标记的 HTML 内容
 * - 32px 圆形，3px 白色边框，阴影
 * - 上方浮动时间标签（小字）
 * - 初始状态：灰色、缩小（scale 0.5），等待 activateMarker 触发动画
 * - 内部含 ripple 元素：颜色从中心向边缘扩散（overflow: hidden 限制不超出圆圈）
 */
function createMarkerContent(idx: number, color: string, time?: string): string {
  const num = idx + 1
  // coral 深色背景用白色文字，amber/mint 浅色背景用深色文字
  const textColor = color === COLOR_CORAL ? '#FFFFFF' : '#1A1A2E'
  const timeHtml = time
    ? `<div style="
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        background: rgba(255,255,255,0.95);
        color: #1A1A2E;
        font-size: 11px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 8px;
        margin-bottom: 4px;
        box-shadow: 0 1px 4px rgba(26,26,46,0.15);
        font-family: 'Noto Sans SC', sans-serif;
        pointer-events: none;
      ">⏰ ${time}</div>`
    : ''
  return `<div data-marker-idx="${idx}" style="
    position: relative;
    width: 32px;
    height: 32px;
    cursor: pointer;
    transition: transform 0.2s ease;
  ">
    ${timeHtml}
    <div class="map-marker-wrapper" style="
      width: 32px;
      height: 32px;
      transform: scale(0.5);
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    ">
      <div class="map-marker-dot" data-marker-color="${color}" style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #CCCCCC;
        color: #999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 15px;
        font-family: 'Noto Sans SC', sans-serif;
        border: 3px solid #AAAAAA;
        box-shadow: 0 2px 8px rgba(26,26,46,0.35);
        position: relative;
        overflow: hidden;
        transition: border-color 0.5s ease 0.1s, box-shadow 0.5s ease 0.1s;
      ">
        <span class="map-marker-ripple" style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: ${color};
          transform: scale(0);
          transition: transform 0.5s ease;
          z-index: 1;
        "></span>
        <span class="map-marker-text" style="
          position: relative;
          z-index: 2;
          transition: color 0.5s ease 0.2s;
        ">${num}</span>
      </div>
    </div>
  </div>`
}

/**
 * 为所有点创建标记
 */
function createMarkers(): void {
  clearMarkers()
  const amap = AMap.value
  const m = map.value
  if (!amap || !m) return

  props.points.forEach((point, idx) => {
    const color = getPointColor(idx)
    const marker = new amap.Marker({
      position: [point.lng, point.lat],
      content: createMarkerContent(idx, color, point.time),
      offset: new amap.Pixel(-16, -16),
      zIndex: 100 + idx
    })
    marker.on('click', () => {
      emit('pointClick', idx)
      openInfoWindow(idx)
    })
    marker.on('mouseover', () => {
      scaleMarker(idx, 1.2)
      openInfoWindow(idx)
    })
    marker.on('mouseout', () => {
      scaleMarker(idx, 1)
    })
    m.add(marker)
    markers.push(marker)
  })
}

/**
 * 缩放标记（hover 放大效果）
 */
function scaleMarker(idx: number, scale: number): void {
  const el = mapContainer.value?.querySelector(`[data-marker-idx="${idx}"]`) as HTMLElement | null
  if (el) el.style.transform = `scale(${scale})`
}

/**
 * 激活标记点（从小变大 + 颜色从灰色扩散到目标色）
 * - 缩放：wrapper 从 scale(0.5) → scale(1)（弹性缓动）
 * - 颜色扩散：内部 ripple 从 scale(0) → scale(1)，颜色从中心向边缘填充
 *   overflow: hidden 确保不超出圆圈范围
 * - 边框从灰色变白色，阴影变为目标色光晕
 * - 文字颜色从灰色变为目标色
 */
function activateMarker(idx: number): void {
  const el = mapContainer.value?.querySelector(`[data-marker-idx="${idx}"]`) as HTMLElement | null
  if (!el) return

  const wrapper = el.querySelector('.map-marker-wrapper') as HTMLElement | null
  const dot = el.querySelector('.map-marker-dot') as HTMLElement | null
  const ripple = el.querySelector('.map-marker-ripple') as HTMLElement | null
  const text = el.querySelector('.map-marker-text') as HTMLElement | null

  // 缩放：从小变大
  if (wrapper) wrapper.style.transform = 'scale(1)'

  if (dot) {
    const color = dot.dataset.markerColor || COLOR_CORAL
    // 边框变白
    dot.style.borderColor = '#FFFFFF'
    // 阴影变为目标色光晕
    dot.style.boxShadow = `0 2px 12px ${color}99`
  }

  // 颜色从中间向周围扩散（不超出圆圈，因父级 overflow: hidden）
  if (ripple) ripple.style.transform = 'scale(1)'

  // 文字变色
  if (text && dot) {
    const color = dot.dataset.markerColor || COLOR_CORAL
    const textColor = color === COLOR_CORAL ? '#FFFFFF' : '#1A1A2E'
    text.style.color = textColor
  }
}

/**
 * 清除所有标记
 */
function clearMarkers(): void {
  const m = map.value
  markers.forEach((mk) => m?.remove(mk))
  markers = []
}

// ========== InfoWindow ==========

/**
 * 打开指定点的信息窗
 * 内容：标题（加粗）+ 时间 + 地址 + 序号
 */
function openInfoWindow(idx: number): void {
  const point = props.points[idx]
  const m = map.value
  if (!point || !m || !infoWindow) return

  const timeHtml = point.time
    ? `<div style="color:#FF6B6B;font-size:12px;margin-top:4px;">⏰ ${point.time}</div>`
    : ''
  const addressHtml = point.address
    ? `<div style="color:#666;font-size:12px;margin-top:2px;">📍 ${point.address}</div>`
    : ''
  const indexHtml = `<div style="color:#999;font-size:11px;margin-top:4px;">第 ${idx + 1} 站</div>`

  const content = `<div style="padding:10px 14px;min-width:160px;max-width:240px;font-family:'Noto Sans SC',sans-serif;">
    <div style="font-weight:700;color:#1A1A2E;font-size:14px;">${point.title}</div>
    ${timeHtml}
    ${addressHtml}
    ${indexHtml}
  </div>`

  infoWindow.setContent(content)
  infoWindow.open(m, [point.lng, point.lat])
}

// ========== 路线规划 ==========

/**
 * 清除所有路线层
 */
function clearRoute(): void {
  const m = map.value
  routeLayers.forEach((l) => m?.remove(l))
  routeLayers = []
  routeSegmentGroups = []
  currentSegmentGroup = null
  transitInfo.value = []
}

/**
 * 开始一个新的分段组（用于逐段路线动画）
 * 在 startSegmentGroup / endSegmentGroup 之间创建的路线层会被追踪，
 * 创建后立即设为单点路径（不可见），等待 animateRoute 渐进式绘制。
 */
function startSegmentGroup(): void {
  currentSegmentGroup = []
}

/**
 * 结束当前分段组，将其加入 routeSegmentGroups
 */
function endSegmentGroup(): void {
  if (currentSegmentGroup && currentSegmentGroup.length > 0) {
    routeSegmentGroups.push(currentSegmentGroup)
  }
  currentSegmentGroup = null
}

/**
 * 将路线层加入当前分段组（用于动画追踪）
 * 在分组模式下，创建后立即将路径设为单点（不渲染线段），等待 animateRoute 渐进式绘制
 */
function trackLayer(layer: any, targetOpacity: number, path: any[]): void {
  if (currentSegmentGroup) {
    currentSegmentGroup.push({ layer, targetOpacity, fullPath: path })
    // 初始只显示第一个点（单点不渲染线段），路径在动画中渐进增长
    layer.setOptions({
      strokeOpacity: targetOpacity,
      path: path.length > 0 ? [path[0]] : []
    })
  }
}

/**
 * 画跨日虚线（从上一日终点到当日起点）
 * - 浅灰色虚线，zIndex 低于主路线，不遮挡主路线
 */
function drawCrossDayLine(from: { lng: number; lat: number }, to: MapPoint): void {
  const amap = AMap.value
  const m = map.value
  if (!amap || !m) return
  const polyline = new amap.Polyline({
    path: [
      [from.lng, from.lat],
      [to.lng, to.lat]
    ],
    strokeColor: '#999',
    strokeWeight: 2,
    strokeStyle: 'dashed',
    strokeOpacity: 0.6,
    zIndex: 40
  })
  m.add(polyline)
  crossDayLineRef.value = polyline
}

/**
 * 清理跨日虚线
 */
function clearCrossDayLine(): void {
  const m = map.value
  if (crossDayLineRef.value) {
    m?.remove(crossDayLineRef.value)
    crossDayLineRef.value = null
  }
}

/**
 * 绘制带白色描边的路线（先白粗线，再 coral 细线）
 */
function drawRouteWithOutline(path: any[]): void {
  const amap = AMap.value
  const m = map.value
  if (!amap || !m || path.length < 2) return
  // 白色描边（粗线，先画）
  const outline = new amap.Polyline({
    path,
    strokeColor: '#FFFFFF',
    strokeWeight: 8,
    strokeOpacity: 1,
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 50
  })
  m.add(outline)
  routeLayers.push(outline)
  trackLayer(outline, 1, path)
  // coral 主线（细线，画在描边之上）
  const main = new amap.Polyline({
    path,
    strokeColor: COLOR_CORAL,
    strokeWeight: 5,
    strokeOpacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round',
    showDir: true,
    zIndex: 51
  })
  m.add(main)
  routeLayers.push(main)
  trackLayer(main, 0.9, path)
}

/**
 * 绘制公交/地铁路线（按段类型分别绘制）
 * - 地铁段（SUBWAY）：蓝色实线（#3B82F6）
 * - 公交段（BUS）：coral 实线（保持现有风格）
 * - 步行段（walking）：灰色虚线（#999）
 */
function drawTransitRoute(segments: RouteSegment[]): void {
  const amap = AMap.value
  const m = map.value
  if (!amap || !m) return
  for (const seg of segments) {
    if (!seg.path || seg.path.length === 0) continue
    let color = COLOR_CORAL
    let weight = 5
    let style: 'solid' | 'dashed' = 'solid'
    let opacity = 0.9

    if (seg.type === 'walking') {
      color = COLOR_WALK
      weight = 2
      style = 'dashed'
      opacity = 0.6
    } else if (seg.mode === 'SUBWAY') {
      color = COLOR_SUBWAY // 蓝色 - 地铁
      weight = 5
    } else if (seg.mode === 'BUS') {
      color = COLOR_CORAL // coral - 公交
      weight = 5
    }

    const polyline = new amap.Polyline({
      path: seg.path,
      strokeColor: color,
      strokeWeight: weight,
      strokeStyle: style,
      strokeOpacity: opacity,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 51
    })
    m.add(polyline)
    routeLayers.push(polyline)
    trackLayer(polyline, opacity, seg.path)
  }
}

/**
 * 绘制虚线直线（导航失败时的回退）
 */
function drawDashedLine(start: MapPoint, end: MapPoint): void {
  const amap = AMap.value
  const m = map.value
  if (!amap || !m) return
  const path = [
    [start.lng, start.lat],
    [end.lng, end.lat]
  ]
  const line = new amap.Polyline({
    path,
    strokeColor: COLOR_CORAL,
    strokeWeight: 4,
    strokeOpacity: 0.7,
    lineJoin: 'round',
    lineCap: 'round',
    showDir: true,
    strokeStyle: 'dashed',
    zIndex: 51
  })
  m.add(line)
  routeLayers.push(line)
  trackLayer(line, 0.7, path)
}

/**
 * 绘制直线连接所有点（mixed 模式）
 */
function drawStraightLine(): void {
  clearRoute()
  if (props.points.length < 2) return
  const path = props.points.map((p) => [p.lng, p.lat])
  drawRouteWithOutline(path)
}

/**
 * 预加载导航插件
 */
function preloadPlugins(): Promise<void> {
  const amap = AMap.value
  if (!amap || pluginsReady) return Promise.resolve()
  return new Promise((resolve) => {
    amap.plugin(['AMap.Driving', 'AMap.Walking', 'AMap.Transfer'], () => {
      pluginsReady = true
      resolve()
    })
  })
}

/**
 * 规划单段路线并返回路径数据（不绘制）
 * @param mode 交通方式，mixed 强制使用 Driving 走真实道路
 * @returns 成功返回路径点数组，失败返回 null
 */
function searchSegmentPath(
  start: MapPoint,
  end: MapPoint,
  mode: TransportMode
): Promise<any[] | null> {
  const amap = AMap.value
  const sessionId = planSessionId
  return new Promise((resolve) => {
    if (!amap) {
      resolve(null)
      return
    }

    // 超时保护：15秒后返回 null，避免步行距离过长等情况长时间卡住
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      console.warn(`[AmapMap] ${mode} 规划超时`)
      resolve(null)
    }, 15000)

    const done = (value: any[] | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    let planner: any
    try {
      // mixed 模式强制使用 Driving 走真实道路网
      if (mode === 'driving' || mode === 'mixed') {
        planner = new amap.Driving({ policy: amap.DrivingPolicy.LEAST_TIME })
      } else if (mode === 'walking') {
        planner = new amap.Walking()
      } else if (mode === 'public') {
        const city = props.city
        if (!city) {
          console.warn('[AmapMap] 公交模式缺少城市参数，跳过规划')
          done(null)
          return
        }
        planner = new amap.Transfer({
          city,
          policy: amap.TransferPolicy?.LEAST_TIME
        })
      } else {
        done(null)
        return
      }
    } catch (e) {
      console.warn('导航插件实例化失败', e)
      done(null)
      return
    }

    planner.search(
      [start.lng, start.lat],
      [end.lng, end.lat],
      (status: string, result: any) => {
        // 会话已被新的规划取代，忽略旧回调
        if (sessionId !== planSessionId || !map.value) {
          done(null)
          return
        }
        if (status !== 'complete' || !result) {
          console.warn(`[AmapMap] ${mode} 路径规划失败:`, status, result)
          done(null)
          return
        }
        try {
          // driving/walking 返回 routes（通常1条），transfer 返回 plans（多个备选方案）
          // public 模式只取第一个 plan，避免多个方案叠加导致路线混乱
          const routes = mode === 'public'
            ? (result.plans?.slice(0, 1) || [])
            : (result.routes || [])
          const allPaths: any[] = []
          routes.forEach((route: any) => {
            // driving/walking 用 steps，transfer 用 segments
            const segments = route.steps || route.segments || []
            segments.forEach((seg: any) => {
              // driving/walking: seg.path
              // transfer: seg.transit.path 或 seg.walking.path
              const path = seg.path || seg.transit?.path || seg.walking?.path
              if (path && path.length > 0) {
                allPaths.push(...path)
              }
            })
          })
          if (allPaths.length > 1) {
            done(allPaths)
            return
          }
        } catch (e) {
          console.warn('解析导航结果失败', e)
        }
        done(null)
      }
    )
  })
}

/**
 * 公交模式专用：规划单段路线并返回分段信息（区分公交/地铁/步行）
 * 兼容高德 API 不同版本：transit 或 bus 字段，transit_mode 或 type 字段
 * @returns 成功返回 RouteSegment[]，失败返回 null
 */
function searchTransitSegments(
  start: MapPoint,
  end: MapPoint
): Promise<RouteSegment[] | null> {
  const amap = AMap.value
  const sessionId = planSessionId
  return new Promise((resolve) => {
    if (!amap) {
      resolve(null)
      return
    }

    const city = props.city
    if (!city) {
      console.warn('[AmapMap] 公交模式缺少城市参数，跳过规划')
      resolve(null)
      return
    }

    let planner: any
    try {
      planner = new amap.Transfer({
        city,
        policy: amap.TransferPolicy?.LEAST_TIME
      })
    } catch (e) {
      console.warn('Transfer 插件实例化失败', e)
      resolve(null)
      return
    }

    planner.search(
      [start.lng, start.lat],
      [end.lng, end.lat],
      (status: string, result: any) => {
        // 会话已被新的规划取代，忽略旧回调
        if (sessionId !== planSessionId || !map.value) {
          resolve(null)
          return
        }
        if (status !== 'complete' || !result) {
          console.warn('[AmapMap] public 路径规划失败:', status, result)
          resolve(null)
          return
        }
        try {
          // 只取第一个方案，避免多个方案叠加导致路线混乱
          const plan = result.plans?.[0]
          if (!plan) {
            resolve(null)
            return
          }
          const segments: RouteSegment[] = []
          for (const seg of (plan.segments || [])) {
            // 兼容不同 API 版本：transit 或 bus 字段
            const transit = seg.transit || seg.bus
            if (transit?.path && transit.path.length > 0) {
              // 解析交通方式：优先 transit_mode（英文），其次 type（中文），最后从 name 推断
              const rawMode = transit.transit_mode || transit.type || ''
              const name = transit.name || ''
              let mode = 'BUS'
              if (
                rawMode === 'SUBWAY' ||
                rawMode === '地铁' ||
                String(rawMode).includes('地铁') ||
                name.includes('地铁')
              ) {
                mode = 'SUBWAY'
              } else if (
                rawMode === 'BUS' ||
                rawMode === '公交' ||
                String(rawMode).includes('公交')
              ) {
                mode = 'BUS'
              }
              segments.push({
                path: transit.path,
                type: 'transit',
                mode,
                name
              })
            } else if (seg.walking?.path && seg.walking.path.length > 0) {
              segments.push({
                path: seg.walking.path,
                type: 'walking'
              })
            }
          }
          if (segments.length > 0) {
            resolve(segments)
            return
          }
        } catch (e) {
          console.warn('解析公交结果失败', e)
        }
        resolve(null)
      }
    )
  })
}

/**
 * 使用途径点一次性规划路线（仅 driving/mixed 支持）
 * 高德 Transfer（公交）不支持途径点；
 * AMap.Walking 的 search 不接受 waypoints 参数（传入会卡住不回调），故 walking 模式也不走此函数。
 * @returns 成功返回完整路径点数组，失败返回 null
 */
function searchPathWithWaypoints(
  points: MapPoint[],
  mode: TransportMode
): Promise<any[] | null> {
  const amap = AMap.value
  const sessionId = planSessionId
  return new Promise((resolve) => {
    if (!amap || points.length < 2) {
      resolve(null)
      return
    }

    // 超时保护：15秒后返回 null，避免途径点规划长时间卡住
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      console.warn(`[AmapMap] ${mode} 途径点规划超时`)
      resolve(null)
    }, 15000)

    const done = (value: any[] | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    let planner: any
    try {
      // mixed 模式强制使用 Driving 走真实道路网
      if (mode === 'driving' || mode === 'mixed') {
        planner = new amap.Driving({ policy: amap.DrivingPolicy.LEAST_TIME })
      } else if (mode === 'walking') {
        planner = new amap.Walking()
      } else {
        done(null)
        return
      }
    } catch (e) {
      console.warn('导航插件实例化失败', e)
      done(null)
      return
    }

    const origin = [points[0].lng, points[0].lat]
    const destination = [points[points.length - 1].lng, points[points.length - 1].lat]
    const waypoints = points.slice(1, -1).map((p) => [p.lng, p.lat])

    planner.search(
      origin,
      destination,
      { waypoints },
      (status: string, result: any) => {
        if (sessionId !== planSessionId || !map.value) {
          done(null)
          return
        }
        if (status !== 'complete' || !result) {
          console.warn(`[AmapMap] ${mode} 途径点规划失败:`, status, result)
          done(null)
          return
        }
        try {
          const routes = result.routes || []
          const allPaths: any[] = []
          routes.forEach((route: any) => {
            const steps = route.steps || []
            steps.forEach((step: any) => {
              if (step.path && step.path.length > 0) {
                allPaths.push(...step.path)
              }
            })
          })
          if (allPaths.length > 1) {
            done(allPaths)
            return
          }
        } catch (e) {
          console.warn('解析途径点导航结果失败', e)
        }
        done(null)
      }
    )
  })
}

/**
 * 规划单段路线（两个相邻点之间）
 * @returns 是否成功绘制了导航路径
 */
async function planSegment(start: MapPoint, end: MapPoint): Promise<boolean> {
  const path = await searchSegmentPath(start, end, currentTransport.value)
  if (path) {
    drawRouteWithOutline(path)
    return true
  }
  return false
}

/**
 * 将完整路径按标记点位置拆分为多段（用于逐段动画）
 * 通过查找路径中距离每个中间标记最近的点来拆分
 */
function splitPathByPoints(path: any[], points: MapPoint[]): any[][] {
  if (points.length <= 2 || path.length < 2) return [path]

  // 为每个中间标记找路径中最近的点索引
  const splitIndices: number[] = [0]
  for (let i = 1; i < points.length - 1; i++) {
    const target = [points[i].lng, points[i].lat]
    let minDist = Infinity
    let minIdx = 0
    for (let j = 1; j < path.length - 1; j++) {
      const dx = path[j][0] - target[0]
      const dy = path[j][1] - target[1]
      const dist = dx * dx + dy * dy
      if (dist < minDist) {
        minDist = dist
        minIdx = j
      }
    }
    // 确保索引严格递增
    if (minIdx > splitIndices[splitIndices.length - 1]) {
      splitIndices.push(minIdx)
    } else {
      splitIndices.push(splitIndices[splitIndices.length - 1] + 1)
    }
  }
  splitIndices.push(path.length - 1)

  // 按拆分点切分子路径
  const segments: any[][] = []
  for (let i = 0; i < splitIndices.length - 1; i++) {
    const start = splitIndices[i]
    const end = splitIndices[i + 1]
    if (end > start) {
      segments.push(path.slice(start, end + 1))
    }
  }

  if (segments.length === 0) return [path]
  return segments
}

/**
 * 渐进式动画显示单段路线
 * - 使用 requestAnimationFrame 实现流畅的路径绘制（非透明度切换）
 * - 路径从起点开始逐步增长，模拟"绘制"效果
 * - 使用 easeInOutQuad 缓动函数让动画更自然
 * - 每层按各自 fullPath 的比例截取，同步推进
 */
function animateSegmentGroup(
  group: AnimatableLayer[],
  duration: number,
  sessionId: number
): Promise<void> {
  const maxPathLength = Math.max(...group.map((l) => l.fullPath.length), 0)

  // 路径太短，直接显示
  if (maxPathLength < 2) {
    for (const { layer, targetOpacity } of group) {
      layer.setOptions({ strokeOpacity: targetOpacity })
    }
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const startTime = performance.now()

    const step = (now: number): void => {
      if (sessionId !== planSessionId) {
        resolve()
        return
      }

      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)

      // easeInOutQuad 缓动：起步慢、中间快、收尾慢，视觉更自然
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2

      // 更新每层的路径（按各自 fullPath 的比例截取）
      for (const { layer, fullPath, targetOpacity } of group) {
        if (fullPath.length < 2) {
          layer.setOptions({ strokeOpacity: targetOpacity })
          continue
        }
        const pointCount = Math.max(2, Math.ceil(eased * fullPath.length))
        layer.setOptions({
          path: fullPath.slice(0, pointCount),
          strokeOpacity: targetOpacity
        })
      }

      if (progress < 1) {
        requestAnimationFrame(step)
      } else {
        resolve()
      }
    }

    requestAnimationFrame(step)
  })
}

/**
 * 逐段动画显示路线 + 逐个激活标记点
 * - 先展示全景视野（让用户看到整体路线）
 * - 每段绘制前平滑过渡视角到该段范围（setFitView immediately=false 带动画）
 * - 使用 requestAnimationFrame 渐进式绘制路径（路径从起点逐步增长）
 * - 每段绘制后激活下一个标记
 * - 全部完成后恢复全景视野
 * - 通过 sessionId 检查取消旧动画
 */
async function animateRoute(sessionId: number): Promise<void> {
  const m = map.value
  const totalSegments = routeSegmentGroups.length
  const totalMarkers = markers.length

  if (totalMarkers === 0 || !m) return

  // 没有路线段：直接逐个激活标记
  if (totalSegments === 0) {
    const allOverlays = [...markers]
    if (allOverlays.length > 0) {
      m.setFitView(allOverlays, false, [80, 80, 80, 80])
    }
    for (let i = 0; i < totalMarkers; i++) {
      if (sessionId !== planSessionId) return
      activateMarker(i)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return
  }

  // 初始：展示全景视野（让用户先看到整体路线概况）
  const allOverlays = [...markers, ...routeLayers]
  if (allOverlays.length > 0) {
    m.setFitView(allOverlays, false, [80, 80, 80, 80])
  }
  await new Promise((resolve) => setTimeout(resolve, 400))

  // 激活起点标记
  activateMarker(0)
  await new Promise((resolve) => setTimeout(resolve, 300))

  // 逐段渐进式绘制
  for (let i = 0; i < totalSegments; i++) {
    if (sessionId !== planSessionId) return

    const group = routeSegmentGroups[i]

    // 平滑过渡视角到当前段（含起终点标记，maxZoom 防止过度放大）
    const groupLayers = group.map((g) => g.layer)
    const segmentOverlays = [...groupLayers]
    if (i < markers.length) segmentOverlays.push(markers[i])
    if (i + 1 < markers.length) segmentOverlays.push(markers[i + 1])
    if (segmentOverlays.length > 0) {
      m.setFitView(segmentOverlays, false, [120, 120, 120, 120], 16)
    }
    // 等待视角过渡动画完成
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (sessionId !== planSessionId) return

    // 根据路径长度计算动画时长（更慢、更清晰）
    // 基础 800ms，每点 +10ms，上限 1800ms
    const maxPathLength = Math.max(...group.map((l) => l.fullPath.length), 0)
    const duration = Math.min(1800, Math.max(800, maxPathLength * 10))

    // 渐进式绘制路径
    await animateSegmentGroup(group, duration, sessionId)

    if (sessionId !== planSessionId) return

    // 激活下一个标记
    if (i + 1 < totalMarkers) {
      activateMarker(i + 1)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  // 最终：恢复全景视野
  if (sessionId !== planSessionId) return
  const finalOverlays = [...markers, ...routeLayers]
  if (finalOverlays.length > 0) {
    m.setFitView(finalOverlays, false, [80, 80, 80, 80])
  }
}

/**
 * 规划完整路线
 * - public 模式：分段规划，区分公交/地铁/步行样式，收集交通方式信息
 * - driving/mixed 模式且点数 > 2：优先用途径点一次性规划，失败回退分段规划
 * - walking 模式：直接用分段规划（AMap.Walking 不支持 waypoints 参数，传入会卡住不回调）
 * - 规划完成后调用 animateRoute 渐进式绘制路线 + 逐个激活标记
 */
async function planRoute(): Promise<void> {
  const m = map.value
  if (!m) return

  // 先清理旧的跨日虚线
  clearCrossDayLine()

  // 画跨日虚线（在主路线之前画，zIndex 较低，不遮挡主路线）
  // 即使 points 不足 2 个，只要有起点也画跨日虚线
  if (props.crossDayPoint && props.points.length > 0) {
    drawCrossDayLine(props.crossDayPoint, props.points[0])
  }

  if (props.points.length < 2) {
    clearRoute()
    // 没有路线，直接激活所有标记
    for (let i = 0; i < markers.length; i++) {
      activateMarker(i)
    }
    return
  }

  planning.value = true
  const sessionId = ++planSessionId
  clearRoute()

  try {
    const mode = currentTransport.value
    const isPublic = mode === 'public'

    // driving/mixed 模式且点数 > 2：优先用途径点一次性规划
    // walking 模式不支持途径点（AMap.Walking 不接受 waypoints 参数），直接走分段规划
    if (!isPublic && mode !== 'walking' && props.points.length > 2) {
      const fullPath = await searchPathWithWaypoints(props.points, mode)
      if (sessionId !== planSessionId) {
        planning.value = false
        return
      }
      if (fullPath) {
        // 将完整路径按标记点拆分为多段，用于逐段动画
        const subPaths = splitPathByPoints(fullPath, props.points)
        for (const subPath of subPaths) {
          startSegmentGroup()
          drawRouteWithOutline(subPath)
          endSegmentGroup()
        }
        transitInfo.value = []
        // 逐段动画（含视角过渡）
        if (sessionId === planSessionId) {
          await animateRoute(sessionId)
        }
        return
      }
      // 途径点规划失败，回退到分段规划
      console.warn(`[AmapMap] ${mode} 途径点规划失败，回退到分段规划`)
    }

    // 分段规划（public 模式必走此分支；其他模式作为途径点规划的回退）
    // mixed 模式由 searchSegmentPath 内部强制使用 Driving 走真实道路网
    const segmentPromises: Promise<{
      success: boolean
      start: MapPoint
      end: MapPoint
      path: any[] | null
      segments: RouteSegment[] | null
    }>[] = []
    for (let i = 0; i < props.points.length - 1; i++) {
      const start = props.points[i]
      const end = props.points[i + 1]
      if (isPublic) {
        segmentPromises.push(
          searchTransitSegments(start, end).then((segments) => ({
            success: !!segments,
            start,
            end,
            path: null,
            segments
          }))
        )
      } else {
        segmentPromises.push(
          searchSegmentPath(start, end, mode).then((path) => ({
            success: !!path,
            start,
            end,
            path,
            segments: null
          }))
        )
      }
    }
    const segmentResults = await Promise.all(segmentPromises)

    // 检查会话有效性（并发期间可能已被新的规划取代）
    if (sessionId !== planSessionId) {
      planning.value = false
      return
    }

    // 统一失败处理：所有模式采用相同的成功率判断策略
    const totalCount = segmentResults.length
    const successCount = segmentResults.filter((r) => r.success).length
    const successRate = totalCount > 0 ? successCount / totalCount : 0
    console.log(
      `[AmapMap] ${mode} 模式路线规划成功率: ${successCount}/${totalCount} (${(successRate * 100).toFixed(1)}%)`
    )

    if (successRate >= 0.5) {
      // 成功率 >= 50%：成功的段画实线，失败的段画虚线
      // 每段路线用 startSegmentGroup/endSegmentGroup 包裹，用于逐段动画
      segmentResults.forEach((r) => {
        startSegmentGroup()
        if (isPublic && r.segments) {
          drawTransitRoute(r.segments)
        } else if (!isPublic && r.path) {
          drawRouteWithOutline(r.path)
        } else {
          drawDashedLine(r.start, r.end)
        }
        endSegmentGroup()
      })

      // 收集公交/地铁信息（用于信息面板）
      if (isPublic) {
        const info: TransitInfoGroup[] = []
        segmentResults.forEach((r, idx) => {
          if (r.segments) {
            info.push({
              fromIndex: idx,
              toIndex: idx + 1,
              items: r.segments.map((s) => ({
                type: s.type,
                mode: s.mode,
                name: s.name
              }))
            })
          }
        })
        transitInfo.value = info
      } else {
        transitInfo.value = []
      }
    } else {
      // 成功率 < 50%：全部回退为直线折线，避免实线-虚线混杂
      startSegmentGroup()
      const straightPath = props.points.map((p) => [p.lng, p.lat])
      drawRouteWithOutline(straightPath)
      endSegmentGroup()
      transitInfo.value = []
    }

    // 逐段动画（含视角过渡）
    if (sessionId === planSessionId) {
      await animateRoute(sessionId)
    }
  } catch (e) {
    console.warn('导航规划失败', e)
    if (sessionId === planSessionId && routeLayers.length === 0) {
      startSegmentGroup()
      const straightPath = props.points.map((p) => [p.lng, p.lat])
      drawRouteWithOutline(straightPath)
      endSegmentGroup()
      transitInfo.value = []
      if (sessionId === planSessionId) {
        await animateRoute(sessionId)
      }
    }
  } finally {
    if (sessionId === planSessionId) {
      planning.value = false
    }
  }
}

// ========== 交通方式切换 ==========

/**
 * 切换交通方式并重新规划路线
 */
async function switchTransport(mode: TransportMode): Promise<void> {
  if (currentTransport.value === mode || planning.value) return
  currentTransport.value = mode
  await planRoute()
}

// ========== 信息面板辅助函数 ==========

/**
 * 获取交通方式段的颜色（用于信息面板圆点）
 */
function getSegmentColor(item: { type: string; mode?: string }): string {
  if (item.type === 'walking') return COLOR_WALK
  if (item.mode === 'SUBWAY') return COLOR_SUBWAY
  return COLOR_CORAL
}

/**
 * 获取交通方式段的图标和标签（用于信息面板文本）
 */
function getSegmentLabel(item: { type: string; mode?: string; name?: string }): string {
  if (item.type === 'walking') return '🚶 步行'
  if (item.mode === 'SUBWAY') return `🚇 ${item.name || '地铁'}`
  if (item.mode === 'BUS') return `🚌 ${item.name || '公交'}`
  return item.name || 'transit'
}

// ========== focusPoint 方法 ==========

/**
 * 聚焦到某个点（平移 + 缩放 + 打开信息窗 + 弹跳动画）
 */
function focusPoint(index: number): void {
  const point = props.points[index]
  const m = map.value
  if (!point || !m) return
  m.setZoomAndCenter(15, [point.lng, point.lat])
  openInfoWindow(index)
  pulseMarker(index)
}

/**
 * 标记弹跳动画
 */
function pulseMarker(idx: number): void {
  const el = mapContainer.value?.querySelector(`[data-marker-idx="${idx}"]`) as HTMLElement | null
  if (!el) return
  // 先重置动画，触发 reflow 后重新播放
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = 'amapMarkerBounce 0.6s ease'
  setTimeout(() => {
    if (el) el.style.animation = ''
  }, 600)
}

// 暴露方法给父组件
defineExpose({ focusPoint })

// ========== 初始化地图 ==========

/**
 * 初始化地图实例
 */
async function initMap(): Promise<void> {
  if (!mapContainer.value) return
  loading.value = true
  errorMsg.value = null

  try {
    const amap = await loadAMap()
    AMap.value = amap

    // 中心点：优先用第一个点，否则默认北京天安门
    const firstPoint = props.points[0]
    const center = firstPoint
      ? [firstPoint.lng, firstPoint.lat]
      : [116.397428, 39.90923]

    const m = new amap.Map(mapContainer.value, {
      zoom: 13,
      center,
      viewMode: '2D',
      resizeEnable: true
    })
    map.value = m

    // 创建信息窗实例
    infoWindow = new amap.InfoWindow({
      offset: new amap.Pixel(0, -40),
      closeWhenClickMap: true,
      autoMove: true
    })

    // 预加载导航插件
    await preloadPlugins()

    // 创建标记
    createMarkers()

    // 规划路线
    await planRoute()

    loading.value = false
  } catch (e: any) {
    console.error('地图初始化失败', e)
    errorMsg.value = e?.message || '地图加载失败'
    loading.value = false
  }
}

/**
 * 重试加载地图
 */
function retry(): void {
  initMap()
}

// ========== 监听器 ==========

// 监听 points 变化，重新创建标记和路线
// 浅监听即可：父组件的 mapPoints 是 computed，每次 routeOrder/activeDay 变化都返回全新数组引用
watch(
  () => props.points,
  () => {
    if (!map.value || !AMap.value) return
    createMarkers()
    planRoute()
  }
)

// 监听 transport prop 变化，只重新规划路线（不重新创建标记）
watch(
  () => props.transport,
  (val) => {
    currentTransport.value = val
    if (map.value) planRoute()
  }
)

// ========== 生命周期 ==========

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  // 取消所有进行中的规划请求和动画
  planSessionId++
  const m = map.value
  if (m) {
    m.destroy()
    map.value = null
  }
  markers = []
  routeLayers = []
  routeSegmentGroups = []
  currentSegmentGroup = null
  infoWindow = null
  crossDayLineRef.value = null
  transitInfo.value = []
})
</script>

<template>
  <div
    class="relative w-full overflow-hidden rounded-2xl shadow-card bg-cream-dark/30"
    :style="{ height }"
  >
    <!-- 地图容器 -->
    <div ref="mapContainer" class="absolute inset-0" />

    <!-- 加载中 -->
    <div
      v-if="loading"
      class="absolute inset-0 z-[1000] grid place-items-center bg-cream/80 backdrop-blur-sm"
    >
      <div class="flex flex-col items-center gap-3">
        <div
          class="w-10 h-10 border-4 border-coral border-t-transparent rounded-full animate-spin"
        />
        <p class="text-sm text-navy/60">地图加载中...</p>
      </div>
    </div>

    <!-- 加载失败 -->
    <div
      v-else-if="errorMsg"
      class="absolute inset-0 z-[1000] grid place-items-center bg-cream/80 backdrop-blur-sm"
    >
      <div class="flex flex-col items-center gap-3 px-6 text-center">
        <div class="text-4xl">🗺️</div>
        <p class="text-sm text-navy/80 font-semibold">地图加载失败</p>
        <p class="text-xs text-navy/50">{{ errorMsg }}</p>
        <button
          type="button"
          class="btn-primary text-xs px-4 py-2"
          @click="retry"
        >
          重试
        </button>
      </div>
    </div>

    <!-- 交通方式切换按钮 -->
    <div
      v-if="!loading && !errorMsg"
      class="absolute top-3 right-3 z-10 flex flex-col gap-1 p-1.5 bg-white/80 backdrop-blur-md rounded-xl shadow-card"
    >
      <button
        v-for="opt in transportOptions"
        :key="opt.mode"
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border-none outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        :class="
          currentTransport === opt.mode
            ? 'bg-coral text-white shadow-md'
            : 'bg-transparent text-navy/70 hover:bg-cream-dark/40'
        "
        :disabled="planning"
        @click="switchTransport(opt.mode)"
      >
        <span
          v-if="planning && currentTransport === opt.mode"
          class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"
        />
        <span v-else>{{ opt.icon }}</span>
        <span>{{ opt.label }}</span>
      </button>
    </div>

    <!-- 路线信息面板（仅 public 模式显示，区分地铁/公交/步行） -->
    <div
      v-if="!loading && !errorMsg && currentTransport === 'public' && transitInfo.length > 0"
      class="absolute bottom-3 left-3 z-10 max-w-[220px] max-h-[60%] overflow-y-auto p-3 bg-white/90 backdrop-blur-md rounded-xl shadow-card"
    >
      <div class="text-xs font-bold text-navy mb-2 flex items-center gap-1">
        <span>🚍</span>
        <span>路线详情</span>
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="group in transitInfo"
          :key="group.fromIndex"
          class="flex flex-col gap-1"
        >
          <div class="text-[10px] text-navy/50 font-semibold">
            第{{ group.fromIndex + 1 }}站 → 第{{ group.toIndex + 1 }}站
          </div>
          <div
            v-for="(item, idx) in group.items"
            :key="idx"
            class="flex items-center gap-1.5 text-xs"
          >
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :style="{ background: getSegmentColor(item) }"
            />
            <span class="text-navy/80">{{ getSegmentLabel(item) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 标记弹跳动画（全局，因为标记 DOM 在地图容器内，不在组件作用域内） */
@keyframes amapMarkerBounce {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  30% {
    transform: translateY(-12px) scale(1.15);
  }
  60% {
    transform: translateY(-4px) scale(1.1);
  }
}
</style>
