export interface PreferenceOption {
  label: string       // 标签名
  emoji?: string      // 保留的 emoji（仅 💕浪漫、🎉朋友聚会 保留）
  icon?: string       // @lucide/vue 图标名（用于替换其他 emoji）
  category: 'mood' | 'interest'  // 原属类别
}

export const PREFERENCE_OPTIONS: PreferenceOption[] = [
  // 心情类（原 moodOptions）
  { label: '放松', icon: 'Smile', category: 'mood' },
  { label: '探险', icon: 'Compass', category: 'mood' },
  { label: '美食', icon: 'Utensils', category: 'mood' },
  { label: '文化', icon: 'Landmark', category: 'mood' },
  { label: '浪漫', emoji: '💕', category: 'mood' },  // 保留 emoji
  { label: '亲子', icon: 'Baby', category: 'mood' },
  { label: '朋友聚会', emoji: '🎉', category: 'mood' },  // 保留 emoji
  { label: '独自享受', icon: 'PersonStanding', category: 'mood' },

  // 兴趣类（原 interestOptions）
  { label: '自然风光', icon: 'Trees', category: 'interest' },
  { label: '历史古迹', icon: 'Landmark', category: 'interest' },
  { label: '美食', icon: 'Utensils', category: 'interest' },
  { label: '购物', icon: 'ShoppingBag', category: 'interest' },
  { label: '艺术', icon: 'Palette', category: 'interest' },
  { label: '夜生活', icon: 'MoonStar', category: 'interest' },
  { label: '运动', icon: 'Volleyball', category: 'interest' },
  { label: '摄影', icon: 'Camera', category: 'interest' },
]

export const PREFERENCE_MAX = 5  // 最多可选数量
