/**
 * 高德地图 JS API 加载与操作 composable
 * - 封装 JS API 2.0 的异步加载（script 标签注入）
 * - 模块级 Promise 缓存，确保全局只加载一次
 * - 提供 useAmap() composable 供组件使用
 */
import { ref, shallowRef } from 'vue'
import type { TransportMode } from '@weekend-planner/shared'

/** 地图上的 POI 点 */
export interface MapPoint {
  /** 经度 */
  lng: number
  /** 纬度 */
  lat: number
  /** 地点名称 */
  title: string
  /** 地址（可选） */
  address?: string
  /** 时间段（如 "09:00"） */
  time?: string
  /** 在行程中的序号（0-based） */
  index: number
}

// 模块级 Promise 缓存，确保高德 JS API 只加载一次
let amapLoaderPromise: Promise<any> | null = null

/**
 * 加载高德 JS API
 * 1. 设置安全密钥（JS API 2.0 必填）
 * 2. 检查 window.AMap 是否已存在
 * 3. 动态注入 script 标签异步加载
 * @returns Promise<typeof AMap>
 */
export function loadAMap(): Promise<any> {
  if (amapLoaderPromise) return amapLoaderPromise
  amapLoaderPromise = new Promise((resolve, reject) => {
    // 1. 设置安全密钥
    ;(window as any)._AMapSecurityConfig = {
      securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE
    }
    // 2. 检查是否已加载
    if ((window as any).AMap) {
      resolve((window as any).AMap)
      return
    }
    // 3. 动态加载 script
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${import.meta.env.VITE_AMAP_KEY}`
    script.async = true
    script.onload = () => {
      if ((window as any).AMap) {
        resolve((window as any).AMap)
      } else {
        reject(new Error('高德地图加载失败：AMap 未挂载到 window'))
      }
    }
    script.onerror = () => reject(new Error('高德地图加载失败'))
    document.head.appendChild(script)
  })
  return amapLoaderPromise
}

/**
 * 高德地图 composable
 * 提供 AMap 构造函数的响应式引用与加载状态
 */
export function useAmap() {
  // 用 shallowRef 避免 AMap 大对象被深度代理
  const AMap = shallowRef<any>(null)
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)

  /**
   * 确保高德 SDK 已加载
   * @returns AMap 构造函数
   */
  async function ensureLoaded(): Promise<any> {
    loading.value = true
    error.value = null
    try {
      const amap = await loadAMap()
      AMap.value = amap
      return amap
    } catch (e: any) {
      error.value = e?.message || '高德地图加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    AMap,
    loading,
    error,
    ensureLoaded
  }
}

/** 交通方式选项（供 UI 使用） */
export interface TransportOption {
  mode: TransportMode
  icon: string
  label: string
}
