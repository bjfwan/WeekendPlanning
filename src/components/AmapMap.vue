<script setup lang="ts">
/**
 * 高德地图组件（专业版）
 * - 数字标记（起点 coral / 中间 amber / 终点 mint），上方显示时间
 * - 路线规划（公交 / 自驾 / 步行 / 直线），含白色描边 + coral 主线
 * - 交通方式切换浮层（右上角，规划中显示 loading）
 * - 暴露 focusPoint 方法（聚焦 + InfoWindow + 弹跳动画）
 */
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue'
import { loadAMap, type MapPoint, type TransportOption } from '@/composables/useAmap'
import type { TransportMode } from '@shared/types'

interface Props {
  /** POI 点列表 */
  points: MapPoint[]
  /** 交通方式：'public'|'driving'|'walking'|'mixed'，默认 'mixed' */
  transport?: TransportMode
  /** 地图高度，默认 '400px' */
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  transport: 'mixed',
  height: '400px'
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

// ========== 内部实例（shallowRef 避免深度代理 AMap 大对象） ==========
const AMap = shallowRef<any>(null)
const map = shallowRef<any>(null)

// 标记、路线层、信息窗等内部集合不需要响应式，用普通变量即可（不会被 Vue 代理）
let markers: any[] = []
let routeLayers: any[] = []
let infoWindow: any = null
/** 路线规划会话 ID，用于取消旧的规划请求 */
let planSessionId = 0
/** 导航插件是否已加载 */
let pluginsReady = false

// ========== 常量 ==========
const COLOR_CORAL = '#FF6B6B'
const COLOR_AMBER = '#FFD93D'
const COLOR_MINT = '#4ECDC4'
/** 公交换乘默认城市（接口固定，无法从 props 传入） */
const DEFAULT_CITY = '北京'

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
    <div style="
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: ${color};
      color: ${textColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
      font-family: 'Noto Sans SC', sans-serif;
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(26,26,46,0.35);
    ">${num}</div>
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
}

/**
 * 绘制虚线直线（导航失败时的回退）
 */
function drawDashedLine(start: MapPoint, end: MapPoint): void {
  const amap = AMap.value
  const m = map.value
  if (!amap || !m) return
  const line = new amap.Polyline({
    path: [
      [start.lng, start.lat],
      [end.lng, end.lat]
    ],
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
 * 规划单段路线（两个相邻点之间）
 * @returns 是否成功绘制了导航路径
 */
function planSegment(start: MapPoint, end: MapPoint): Promise<boolean> {
  const amap = AMap.value
  const sessionId = planSessionId
  return new Promise((resolve) => {
    if (!amap) {
      resolve(false)
      return
    }

    let planner: any
    try {
      if (currentTransport.value === 'driving') {
        planner = new amap.Driving({ policy: amap.DrivingPolicy.LEAST_TIME })
      } else if (currentTransport.value === 'walking') {
        planner = new amap.Walking()
      } else if (currentTransport.value === 'public') {
        planner = new amap.Transfer({ city: DEFAULT_CITY })
      } else {
        resolve(false)
        return
      }
    } catch (e) {
      console.warn('导航插件实例化失败', e)
      resolve(false)
      return
    }

    planner.search(
      [start.lng, start.lat],
      [end.lng, end.lat],
      (status: string, result: any) => {
        // 会话已被新的规划取代，忽略旧回调
        if (sessionId !== planSessionId || !map.value) {
          resolve(false)
          return
        }
        if (status === 'complete' && result) {
          try {
            // driving/walking 返回 routes，transfer 返回 plans
            const routes = result.routes || result.plans || []
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
              drawRouteWithOutline(allPaths)
              resolve(true)
              return
            }
          } catch (e) {
            console.warn('解析导航结果失败', e)
          }
        }
        resolve(false)
      }
    )
  })
}

/**
 * 规划完整路线（分段规划相邻点之间的路线）
 */
async function planRoute(): Promise<void> {
  const m = map.value
  if (!m) return
  if (props.points.length < 2) {
    clearRoute()
    return
  }

  planning.value = true
  const sessionId = ++planSessionId
  clearRoute()

  try {
    if (currentTransport.value === 'mixed') {
      // mixed 模式直接用直线连接
      drawStraightLine()
    } else {
      // 分段规划相邻点之间的路线
      let anySuccess = false
      for (let i = 0; i < props.points.length - 1; i++) {
        // 被新的规划取代时提前退出
        if (sessionId !== planSessionId) {
          planning.value = false
          return
        }
        const ok = await planSegment(props.points[i], props.points[i + 1])
        if (sessionId !== planSessionId) {
          planning.value = false
          return
        }
        if (ok) {
          anySuccess = true
        } else {
          // 导航失败，回退到虚线直线
          drawDashedLine(props.points[i], props.points[i + 1])
        }
      }
      // 全部失败且没有任何路线，回退到直线连接
      if (!anySuccess && routeLayers.length === 0) {
        drawStraightLine()
      }
    }

    // 规划完成后自适应视野（包含标记和路线）
    if (sessionId === planSessionId) {
      const allOverlays = [...markers, ...routeLayers]
      if (allOverlays.length > 0) {
        m.setFitView(allOverlays, false, [80, 80, 80, 80])
      }
    }
  } catch (e) {
    console.warn('导航规划失败', e)
    if (sessionId === planSessionId && routeLayers.length === 0) {
      drawStraightLine()
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
watch(
  () => props.points,
  () => {
    if (!map.value || !AMap.value) return
    createMarkers()
    planRoute()
  },
  { deep: true }
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
  // 取消所有进行中的规划请求
  planSessionId++
  const m = map.value
  if (m) {
    m.destroy()
    map.value = null
  }
  markers = []
  routeLayers = []
  infoWindow = null
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
