/**
 * BaseTag 组件动态图标映射表
 *
 * 背景：原 BaseTag.vue 通过 `import { icons } from '@lucide/vue'` 引入全量图标对象，
 * 导致 @lucide/vue 整包（约 800KB）被打入 preferences chunk，严重影响首屏加载。
 *
 * 优化：此处仅按需具名导入 BaseTag 实际可能用到的图标（由 src/data/preferences.ts
 * 中的 `icon` 字段引用），构建时 tree-shaking 会剔除其余图标。
 *
 * 新增偏好图标时，需同步在下方导入并加入 iconMap。
 */
import type { Component } from 'vue'
import {
  Smile,
  Compass,
  Utensils,
  Landmark,
  Baby,
  PersonStanding,
  Trees,
  ShoppingBag,
  Palette,
  MoonStar,
  Volleyball,
  Camera
} from '@lucide/vue'

export const iconMap: Record<string, Component> = {
  Smile,
  Compass,
  Utensils,
  Landmark,
  Baby,
  PersonStanding,
  Trees,
  ShoppingBag,
  Palette,
  MoonStar,
  Volleyball,
  Camera
}

export type IconName = keyof typeof iconMap
