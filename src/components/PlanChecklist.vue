<script setup lang="ts">
/** 出行清单组件：物品准备、提醒事项、地图链接 */
import { onMounted, ref } from 'vue'
import type { PlanChecklist as Checklist } from '@weekend-planner/shared'
import { useGsap } from '@/composables/useGsap'

defineProps<{ checklist: Checklist }>()

const { gsap, context, matchMedia, EASE_OUT } = useGsap()

// 网格容器 ref
const gridRef = ref<HTMLElement | null>(null)

// 入场动画：3 列卡片 stagger + 每列内物品 stagger 淡入
onMounted(() => {
  context(() => {
    matchMedia((_ctx, isReduce) => {
      if (!gridRef.value) return
      const cards = Array.from(gridRef.value.querySelectorAll<HTMLElement>('.checklist-card'))
      const allItems = Array.from(gridRef.value.querySelectorAll<HTMLElement>('.checklist-item'))

      if (isReduce) {
        // reduced motion：直接显示，不做动画
        gsap.set([...cards, ...allItems], { clearProps: 'all' })
        return
      }

      // 3 列卡片 stagger 入场（y: 20, opacity: 0, stagger: 0.1）
      if (cards.length) {
        gsap.from(cards, {
          y: 20,
          opacity: 0,
          stagger: 0.1,
          duration: 0.5,
          ease: EASE_OUT
        })
      }

      // 每列内物品 stagger 淡入（stagger 0.03），跟随卡片顺序错开
      cards.forEach((card, cardIdx) => {
        const cardItems = Array.from(card.querySelectorAll<HTMLElement>('.checklist-item'))
        if (!cardItems.length) return
        gsap.from(cardItems, {
          y: 10,
          opacity: 0,
          stagger: 0.03,
          duration: 0.4,
          ease: EASE_OUT,
          delay: 0.3 + cardIdx * 0.1
        })
      })
    })
  }, gridRef.value ?? undefined)
})

/** checkbox hover 反馈：即使只读，hover 时也有轻微缩放 */
function handleCheckEnter(e: MouseEvent): void {
  const target = e.currentTarget as HTMLElement
  matchMedia((_ctx, isReduce) => {
    if (isReduce) return
    gsap.to(target, { scale: 1.15, duration: 0.2, ease: 'power2.out' })
  })
}

/** checkbox hover 离开：复位 */
function handleCheckLeave(e: MouseEvent): void {
  const target = e.currentTarget as HTMLElement
  matchMedia((_ctx, isReduce) => {
    if (isReduce) return
    gsap.to(target, { scale: 1, duration: 0.2, ease: 'power2.out' })
  })
}
</script>

<template>
  <div ref="gridRef" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <!-- 物品准备 -->
    <div class="checklist-card bg-white rounded-2xl p-5 shadow-card">
      <h4 class="flex items-center gap-2 font-bold text-navy mb-3">
        <span class="w-8 h-8 grid place-items-center rounded-lg bg-coral/10 text-lg">🎒</span>
        物品准备
      </h4>
      <ul v-if="checklist.items.length" class="space-y-2">
        <li
          v-for="(item, i) in checklist.items"
          :key="i"
          class="checklist-item flex items-start gap-2 text-sm text-navy/70"
        >
          <span
            class="shrink-0 mt-0.5 w-4 h-4 rounded border-2 border-coral/40"
            @mouseenter="handleCheckEnter"
            @mouseleave="handleCheckLeave"
          />
          {{ item }}
        </li>
      </ul>
      <p v-else class="text-sm text-navy/40">暂无物品清单</p>
    </div>

    <!-- 提醒事项 -->
    <div class="checklist-card bg-white rounded-2xl p-5 shadow-card">
      <h4 class="flex items-center gap-2 font-bold text-navy mb-3">
        <span class="w-8 h-8 grid place-items-center rounded-lg bg-amber/20 text-lg">⏰</span>
        提醒事项
      </h4>
      <ul v-if="checklist.reminders.length" class="space-y-2">
        <li
          v-for="(reminder, i) in checklist.reminders"
          :key="i"
          class="checklist-item flex items-start gap-2 text-sm text-navy/70"
        >
          <span class="shrink-0 mt-0.5 text-amber">•</span>
          {{ reminder }}
        </li>
      </ul>
      <p v-else class="text-sm text-navy/40">暂无提醒事项</p>
    </div>

    <!-- 地图链接 -->
    <div class="checklist-card bg-white rounded-2xl p-5 shadow-card sm:col-span-2 lg:col-span-1">
      <h4 class="flex items-center gap-2 font-bold text-navy mb-3">
        <span class="w-8 h-8 grid place-items-center rounded-lg bg-mint/15 text-lg">🗺️</span>
        地图导航
      </h4>
      <div v-if="checklist.mapLinks.length" class="flex flex-col gap-2">
        <a
          v-for="(link, i) in checklist.mapLinks"
          :key="i"
          :href="link"
          target="_blank"
          rel="noopener noreferrer"
          class="checklist-item inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-mint/10 text-mint text-sm font-medium hover:bg-mint/20 transition-colors"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          查看路线 {{ i + 1 }}
        </a>
      </div>
      <p v-else class="text-sm text-navy/40">暂无地图链接</p>
    </div>
  </div>
</template>