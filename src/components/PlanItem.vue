<script setup lang="ts">
/** 单个行程项卡片，展示时间、标题、地点、描述、花费等 */
import type { PlanItem } from '@weekend-planner/shared'

defineProps<{ item: PlanItem }>()
</script>

<template>
  <div class="relative bg-white rounded-2xl p-5 shadow-card transition-all duration-300 hover:shadow-hover hover:-translate-y-0.5">
    <!-- 顶部：时间 + 花费 -->
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-coral/10 text-coral text-sm font-bold">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {{ item.time }}<template v-if="item.endTime"> – {{ item.endTime }}</template>
        </span>
        <span v-if="item.duration" class="text-xs text-navy/50 font-medium">{{ item.duration }}</span>
      </div>
      <span v-if="item.cost > 0" class="shrink-0 px-2.5 py-1 rounded-lg bg-amber/20 text-navy text-sm font-bold">
        ¥{{ item.cost }}
      </span>
      <span v-else class="shrink-0 px-2.5 py-1 rounded-lg bg-mint/15 text-mint text-sm font-bold">
        免费
      </span>
    </div>

    <!-- 标题 -->
    <h4 class="text-lg font-bold text-navy mb-1">{{ item.title }}</h4>

    <!-- 地点 -->
    <p v-if="item.location" class="flex items-center gap-1 text-sm text-navy/60 mb-2">
      <svg class="w-4 h-4 shrink-0 text-coral" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
      </svg>
      {{ item.location }}<template v-if="item.address"> · {{ item.address }}</template>
    </p>

    <!-- 描述 -->
    <p class="text-sm text-navy/70 leading-relaxed mb-3">{{ item.description }}</p>

    <!-- 交通方式 -->
    <div v-if="item.transport" class="flex items-center gap-1.5 text-xs text-navy/50 mb-2">
      <svg class="w-4 h-4 text-mint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h8m-8 4h8m-8 4h8M4 4v16M20 4v16" />
      </svg>
      <span>{{ item.transport }}</span>
    </div>

    <!-- 备选方案 -->
    <div v-if="item.alternatives && item.alternatives.length" class="mb-2">
      <p class="text-xs font-semibold text-navy/50 mb-1">备选方案</p>
      <div class="flex flex-wrap gap-1.5">
        <span v-for="(alt, i) in item.alternatives" :key="i" class="px-2 py-0.5 rounded-md bg-navy/5 text-xs text-navy/60">
          {{ alt }}
        </span>
      </div>
    </div>

    <!-- 小贴士 -->
    <div v-if="item.tips" class="mt-3 p-3 rounded-xl bg-amber/10 border border-amber/20">
      <p class="flex items-start gap-1.5 text-sm text-navy/70">
        <span class="shrink-0">💡</span>
        <span>{{ item.tips }}</span>
      </p>
    </div>
  </div>
</template>
