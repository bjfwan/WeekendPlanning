<script setup lang="ts">
/** 单日行程时间轴，纵向展示当日所有行程项 */
import type { DayPlan } from '@weekend-planner/shared'
import PlanItem from './PlanItem.vue'

defineProps<{ day: DayPlan }>()
</script>

<template>
  <div class="relative">
    <!-- 时间轴竖线 -->
    <div class="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-coral via-amber to-mint opacity-30" />

    <div class="space-y-5">
      <div v-for="(item, i) in day.items" :key="i" class="relative pl-8">
        <!-- 时间轴节点 -->
        <span
          class="absolute left-0 top-5 w-4 h-4 rounded-full border-4 border-cream shadow-md z-10"
          :class="i === 0 ? 'bg-coral' : i === day.items.length - 1 ? 'bg-mint' : 'bg-amber'"
        />
        <PlanItem :item="item" />
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
