<script setup lang="ts">
/** 单日行程时间轴，纵向展示当日所有行程项 */
import { computed, onMounted, ref } from 'vue'
import type { DayPlan, PlanItem } from '@weekend-planner/shared'
import PlanItemComp from './PlanItem.vue'
import { useGsap } from '@/composables/useGsap'
import { useGsapNumber } from '@/composables/useGsapNumber'

interface Props {
  day: DayPlan
  items?: PlanItem[] // 可选，传入则用此数据渲染（用于路线切换联动）
}

const props = defineProps<Props>()

// 渲染用的 items：优先用传入的 items，否则用 day.items
const renderItems = computed(() => props.items ?? props.day.items)

const { gsap, context, matchMedia, EASE_OUT, EASE_BACK } = useGsap()

// 容器 ref
const containerRef = ref<HTMLElement | null>(null)
// 竖线 ref
const lineRef = ref<HTMLElement | null>(null)

// 当日合计数字滚动
const totalCostDisplay = useGsapNumber(() => props.day.totalCost, { duration: 1.0 })

// 入场动画：竖线从上到下绘制 + 行程项 stagger + 节点逐个 pulse
onMounted(() => {
  context(() => {
    matchMedia((_ctx, isReduce) => {
      if (!containerRef.value) return
      const nodes = Array.from(containerRef.value.querySelectorAll<HTMLElement>('.timeline-node'))
      const itemWrappers = Array.from(containerRef.value.querySelectorAll<HTMLElement>('.timeline-item'))

      if (isReduce) {
        // reduced motion：直接显示，不做动画
        const targets = [lineRef.value, ...nodes, ...itemWrappers].filter(Boolean) as HTMLElement[]
        gsap.set(targets, { clearProps: 'all' })
        return
      }

      // 竖线从上到下绘制（scaleY 0->1, transformOrigin: top）
      if (lineRef.value) {
        gsap.fromTo(
          lineRef.value,
          { scaleY: 0, transformOrigin: 'top' },
          { scaleY: 1, duration: 0.6, ease: EASE_OUT }
        )
      }

      // 行程项 stagger 入场（x: -20, opacity: 0）
      if (itemWrappers.length) {
        gsap.from(itemWrappers, {
          x: -20,
          opacity: 0,
          stagger: 0.08,
          duration: 0.5,
          ease: EASE_OUT
        })
      }

      // 节点按顺序逐个 pulse（scale 1->1.3->1, EASE_BACK）
      if (nodes.length) {
        gsap.fromTo(
          nodes,
          { scale: 1 },
          {
            scale: 1.3,
            duration: 0.3,
            ease: EASE_BACK,
            stagger: 0.08,
            yoyo: true,
            repeat: 1
          }
        )
      }
    })
  }, containerRef.value ?? undefined)
})
</script>

<template>
  <div ref="containerRef" class="relative">
    <!-- 时间轴竖线 -->
    <div
      ref="lineRef"
      class="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-coral via-amber to-mint opacity-30"
    />

    <div class="space-y-5">
      <div
        v-for="(item, i) in renderItems"
        :key="i"
        class="timeline-item relative pl-8"
      >
        <!-- 时间轴节点 -->
        <span
          class="timeline-node absolute left-0 top-5 w-4 h-4 rounded-full border-4 border-cream shadow-md z-10"
          :class="i === 0 ? 'bg-coral' : i === renderItems.length - 1 ? 'bg-mint' : 'bg-amber'"
        />
        <PlanItemComp :item="item" :appear="false" />
      </div>
    </div>

    <!-- 当日合计 -->
    <div v-if="day.items.length" class="mt-5 pl-8">
      <div class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-white text-sm font-semibold">
        <span>第 {{ day.day }} 天合计</span>
        <span class="text-amber">¥{{ Math.round(totalCostDisplay) }}</span>
      </div>
    </div>
  </div>
</template>
