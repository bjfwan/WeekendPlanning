<script setup lang="ts">
/** 单日行程时间轴，纵向展示当日所有行程项 */
import { computed } from 'vue'
import type { DayPlan, PlanItem } from '@weekend-planner/shared'
import PlanItemComp from './PlanItem.vue'

interface Props {
  day: DayPlan
  items?: PlanItem[] // 可选，传入则用此数据渲染（用于路线切换联动）
}

const props = withDefaults(defineProps<Props>(), {})

// 渲染用的 items：优先用传入的 items，否则用 day.items
const renderItems = computed(() => props.items ?? props.day.items)
</script>

<template>
  <div class="relative">
    <!-- 时间轴竖线 -->
    <div class="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-coral via-amber to-mint opacity-30" />

    <div class="space-y-5">
      <div v-for="(item, i) in renderItems" :key="i" class="relative pl-8">
        <!-- 时间轴节点 -->
        <span
          class="absolute left-0 top-5 w-4 h-4 rounded-full border-4 border-cream shadow-md z-10"
          :class="i === 0 ? 'bg-coral' : i === renderItems.length - 1 ? 'bg-mint' : 'bg-amber'"
        />
        <PlanItemComp :item="item" />
      </div>
    </div>

    <!-- 当日合计 -->
    <div v-if="day.items.length" class="mt-5 pl-8">
      <div class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-white text-sm font-semibold">
        <span>第 {{ day.day }} 天合计</span>
        <span class="text-amber">¥{{ day.totalCost }}</span>
      </div>
    </div>
  </div>
</template>
