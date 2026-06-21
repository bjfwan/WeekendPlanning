<script setup lang="ts">
/**
 * 高德地图组件
 * - 展示行程 POI 标记（数字序号 + 彩色圆形背景）
 * - 路线连线（直线 / 导航插件规划）
 * - 交通方式切换（公交 / 自驾 / 步行 / 直线）
 * - 暴露 focusPoint 方法供外部调用
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const currentTransport = ref<TransportMode>(props.transport)

// ========== 内部实例（非响应式） ==========
let AMap: any = null
let map: any = null
let markers: any[] = []
let polyline: any = null
let infoWindow: any = null
let routeLayers: any[] = []
// 路线规划会话 ID，用于取消旧的规划请求
let planSessionId = 0

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
  if (total <= 1) return '#FF6B6B'
  if (idx === 0) return '#FF6B6B' // coral
  if (idx === total - 1) return '#4ECDC4' // mint
  return '#FFD93D' // amber
}

/**
 * 创建数字标记的 HTML 内容
 */
function createMarkerContent(idx: number, color: string): string {
  const num = idx + 1
  // amber 色背景用深色文字，其他用白色文字
  const textColor = color === '#FFD93D' ? '#1A1A2E' : '#FFFFFF'
  return `<div style="
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: ${color};
    color: ${textColor};
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 16px;
    font-family: 'Noto Sans SC', sans-serif;
    border: 3px solid #FFFFFF;
    box-shadow: 0 2px 8px rgba(26,26,46,0.35);
    cursor: pointer;
    transition: transform 0.2s ease;
  " onmouseover="this.style.transform='scale(1.15)'"
    onmouseout="this.style.transform='scale(1)'"
  >${num}</div>`
}

/**
 * 为所有点创建标记
 */
function createMarkers(): void {
  clearMarkers()
  if (!map || !AMap) return

  props.points.forEach((point, idx) => {
    const color = getPointColor(idx)
    const marker = new AMap.Marker({
      position: [point.lng, point.lat],
      content: createMarkerContent(idx, color),
      offset: new AMap.Pixel(-18, -18),
      anchor: 'center',
      zIndex: 100 + idx
    })
    marker.on('click', () => {
      emit('pointClick', idx)
      openInfoWindow(idx)
    })
    marker.on('mouseover', () => {
      openInfoWindow(idx)
    })
    map.add(marker)
    markers.push(marker)
  })
}

/**
 * 清除所有标记
 */
function clearMarkers(): void {
  markers.forEach((m) => map?.remove(m))
  markers = []
}

// ========== 信息窗 ==========

/**
 * 打开指定点的信息窗
 */
function openInfoWindow(idx: number): void {
  const point = props.points[idx]
  if (!point || !map || !infoWindow) return

  const timeHtml = point.time
    ? `<div style="color:#FF6B6B;font-size:12px;margin-bottom:2px;">⏰ ${point.time}</div>`
    : ''
  const addressHtml = point.address
    ? `<div style="color:#666;font-size:12px;">📍 ${point.address}</div>`
    : ''

  const content = `<div style="padding:8px 12px;min-width:160px;max-width:240px;">
    <div style="font-weight:600;color:#1A1A2E;margin-bottom:4px;font-size:14px;">${point.title}</div>
    ${timeHtml}
    ${addressHtml}
  </div>`

  infoWindow.setContent(content)
  infoWindow.open(map, [point.lng, point.lat])
}

// ========== 路线规划 ==========

/**
 * 清除所有路线
 */
function clearRoute(): void {
  routeLayers.forEach((l) => map?.remove(l))
  routeLayers = []
  if (polyline) {
    map?.remove(polyline)
    polyline = null
  }
}

/**
 * 绘制直线连接所有点
 */
function drawStraightLine(): void {
  clearRoute()
  if (!map || !AMap || props.points.length < 2) return

  const path = props.points.map((p) => [p.lng, p.lat])
  polyline = new AMap.Polyline({
    path,
    strokeColor: '#FF6B6B',
    strokeWeight: 4,
    strokeOpacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round',
    showDir: true
  })
  map.add(polyline)
}

/**
 * 预加载导航插件
 */
function preloadPlugins(): Promise<void> {
  return new Promise((resolve) => {
    AMap.plugin(['AMap.Driving', 'AMap.Walking', 'AMap.Transfer'], () => {
      resolve()
    })
  })
}

/**
 * 规划单段路线（两个相邻点之间）
 * 使用当前选中的交通方式调用对应导航插件
 */
function planSegment(start: MapPoint, end: MapPoint): Promise<void> {
  const sessionId = planSessionId
  return new Promise((resolve) => {
    try {
      let planner: any
      if (currentTransport.value === 'driving') {
        planner = new AMap.Driving()
      } else if (currentTransport.value === 'walking') {
        planner = new AMap.Walking()
      } else if (currentTransport.value === 'public') {
        planner = new AMap.Transfer()
      } else {
        resolve()
        return
      }

      let drewPath = false

      planner.search(
        [start.lng, start.lat],
        [end.lng, end.lat],
        (status: string, result: any) => {
          // 会话已被新的规划取代，忽略旧回调
          if (sessionId !== planSessionId) {
            resolve()
            return
          }
          if (status === 'complete' && result) {
            try {
              // driving/walking 返回 routes，transfer 返回 plans
              const routes = result.routes || result.plans || []
              routes.forEach((route: any) => {
                // driving/walking 用 steps，transfer 用 segments
                const segments = route.steps || route.segments || []
                segments.forEach((seg: any) => {
                  // driving/walking: seg.path
                  // transfer: seg.transit.path 或 seg.walking.path
                  const path = seg.path || seg.transit?.path || seg.walking?.path
                  if (path && path.length > 0) {
                    const line = new AMap.Polyline({
                      path,
                      strokeColor: '#FF6B6B',
                      strokeWeight: 4,
                      strokeOpacity: 0.9,
                      lineJoin: 'round',
                      lineCap: 'round',
                      showDir: true
                    })
                    map.add(line)
                    routeLayers.push(line)
                    drewPath = true
                  }
                })
              })
            } catch (e) {
              console.warn('解析导航结果失败', e)
            }
          }

          // 如果导航未返回路径，用虚线直线连接该段
          if (!drewPath && sessionId === planSessionId) {
            const line = new AMap.Polyline({
              path: [
                [start.lng, start.lat],
                [end.lng, end.lat]
              ],
              strokeColor: '#FF6B6B',
              strokeWeight: 4,
              strokeOpacity: 0.7,
              lineJoin: 'round',
              lineCap: 'round',
              showDir: true,
              strokeStyle: 'dashed'
            })
            map.add(line)
            routeLayers.push(line)
          }

          resolve()
        }
      )
    } catch (e) {
      console.warn('导航插件调用失败', e)
      resolve()
    }
  })
}

/**
 * 规划完整路线
 */
async function planRoute(): Promise<void> {
  if (!map || !AMap) return
  if (props.points.length < 2) {
    clearRoute()
    return
  }

  // mixed 模式直接用直线连接
  if (currentTransport.value === 'mixed') {
    drawStraightLine()
    return
  }

  // 使用导航插件规划
  const sessionId = ++planSessionId
  clearRoute()
  try {
    // 分段规划相邻点之间的路线
    for (let i = 0; i < props.points.length - 1; i++) {
      if (sessionId !== planSessionId) return // 被新的规划取代
      await planSegment(props.points[i], props.points[i + 1])
    }
    // 如果导航未返回任何路径，回退到直线连接
    if (sessionId === planSessionId && routeLayers.length === 0) {
      drawStraightLine()
    }
  } catch (e) {
    if (sessionId === planSessionId) {
      console.warn('导航规划失败，回退到直线连接', e)
      drawStraightLine()
    }
  }
}

// ========== 交通方式切换 ==========

/**
 * 切换交通方式并重新规划路线
 */
async function switchTransport(mode: TransportMode): Promise<void> {
  if (currentTransport.value === mode) return
  currentTransport.value = mode
  await planRoute()
}

// ========== focusPoint 方法 ==========

/**
 * 聚焦到某个点（平移 + 缩放 + 打开信息窗）
 */
function focusPoint(index: number): void {
  const point = props.points[index]
  if (!point || !map) return
  map.setZoomAndCenter(15, [point.lng, point.lat])
  openInfoWindow(index)
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
    AMap = await loadAMap()

    // 中心点：优先用第一个点，否则默认北京天安门
    const firstPoint = props.points[0]
    const center = firstPoint
      ? [firstPoint.lng, firstPoint.lat]
      : [116.397428, 39.90923]

    map = new AMap.Map(mapContainer.value, {
      zoom: 13,
      center,
      viewMode: '2D',
      resizeEnable: true
    })

    // 创建信息窗实例
    infoWindow = new AMap.InfoWindow({
      offset: new AMap.Pixel(0, -36),
      closeWhenClickMap: true,
      autoMove: true
    })

    // 预加载导航插件
    await preloadPlugins()

    // 创建标记
    createMarkers()

    // 规划路线
    await planRoute()

    // 自适应视野（包含所有标记）
    if (markers.length > 0) {
      map.setFitView(markers, false, [80, 80, 80, 80])
    }

    loading.value = false
  } catch (e: any) {
    console.error('地图初始化失败', e)
    errorMsg.value = e?.message || '地图加载失败'
    loading.value = false
  }
}

// ========== 监听器 ==========

// 监听 points 变化，重新创建标记和路线
watch(
  () => props.points,
  () => {
    if (!map || !AMap) return
    createMarkers()
    planRoute()
    if (markers.length > 0) {
      map.setFitView(markers, false, [80, 80, 80, 80])
    }
  },
  { deep: true }
)

// 监听 transport prop 变化
watch(
  () => props.transport,
  (val) => {
    currentTransport.value = val
    if (map) planRoute()
  }
)

// ========== 生命周期 ==========

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  if (map) {
    map.destroy()
    map = null
  }
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
      class="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80 backdrop-blur-sm"
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
      class="absolute inset-0 z-[1000] flex items-center justify-center bg-white/90"
    >
      <div class="flex flex-col items-center gap-2 px-6 text-center">
        <div class="text-3xl">🗺️</div>
        <p class="text-sm text-navy/80 font-semibold">地图加载失败</p>
        <p class="text-xs text-navy/50">{{ errorMsg }}</p>
      </div>
    </div>

    <!-- 交通方式切换按钮 -->
    <div
      v-if="!loading && !errorMsg"
      class="absolute top-3 right-3 z-[500] flex flex-col gap-1 p-1.5 bg-white/85 backdrop-blur-md rounded-xl shadow-card"
    >
      <button
        v-for="opt in transportOptions"
        :key="opt.mode"
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border-none outline-none"
        :class="
          currentTransport === opt.mode
            ? 'bg-coral text-white shadow-md'
            : 'bg-transparent text-navy/70 hover:bg-cream-dark/40'
        "
        @click="switchTransport(opt.mode)"
      >
        <span>{{ opt.icon }}</span>
        <span>{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>
