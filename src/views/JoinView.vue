<script setup lang="ts">
/** 多人协同加入页 - 通过分享码加入行程 */
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/components/BaseButton.vue'
import BaseInput from '@/components/BaseInput.vue'
import BaseTag from '@/components/BaseTag.vue'
import BaseCard from '@/components/BaseCard.vue'

const route = useRoute()
const router = useRouter()
const shareCode = route.params.code as string

// 昵称
const nickname = ref('')
// 选中的偏好标签
const preferences = reactive<string[]>([])
// 提交状态
const submitted = ref(false)
// 已加入的成员（模拟数据，后续接入 Supabase Realtime）
const members = ref<Array<{ nickname: string; preferences: string[] }>>([])

// 偏好标签选项
const preferenceOptions = [
  { label: '放松', emoji: '😌' },
  { label: '探险', emoji: '🧗' },
  { label: '美食', emoji: '🍜' },
  { label: '文化', emoji: '🏛️' },
  { label: '浪漫', emoji: '💕' },
  { label: '亲子', emoji: '👨‍👩‍👧' },
  { label: '朋友聚会', emoji: '🎉' },
  { label: '自然风光', emoji: '🌿' },
  { label: '历史古迹', emoji: '🏯' },
  { label: '购物', emoji: '🛍️' },
  { label: '艺术', emoji: '🎨' },
  { label: '夜生活', emoji: '🌃' }
]

// 切换偏好标签
function togglePreference(label: string) {
  const idx = preferences.indexOf(label)
  if (idx >= 0) {
    preferences.splice(idx, 1)
  } else {
    preferences.push(label)
  }
}

// 提交加入
function handleJoin() {
  if (!nickname.value.trim()) return
  // 模拟加入（后续接入 Supabase Realtime 实时同步）
  members.value.push({ nickname: nickname.value.trim(), preferences: [...preferences] })
  submitted.value = true
}
</script>

<template>
  <div class="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10">
    <!-- 装饰背景 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-20 left-1/4 w-72 h-72 rounded-full bg-amber/10 blur-3xl" />
      <div class="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-mint/10 blur-3xl" />
    </div>

    <div class="relative w-full max-w-md">
      <!-- 头部 -->
      <div class="text-center mb-6">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white shadow-card text-sm font-medium text-mint mb-4">
          <span class="w-2 h-2 rounded-full bg-mint animate-pulse" />
          多人协同规划
        </div>
        <h1 class="font-display text-3xl font-bold text-navy mb-2">加入行程协同</h1>
        <p class="text-navy/50 text-sm">分享码：<span class="font-mono font-bold text-coral">{{ shareCode }}</span></p>
      </div>

      <!-- 已加入状态 -->
      <BaseCard v-if="submitted" padding="lg" class="text-center">
        <div class="text-5xl mb-3">🎉</div>
        <h2 class="text-lg font-bold text-navy mb-2">加入成功！</h2>
        <p class="text-sm text-navy/60 mb-4">
          你的偏好已同步给创建者，<br />等待行程生成中...
        </p>

        <!-- 已加入成员列表 -->
        <div v-if="members.length" class="mt-4 pt-4 border-t border-navy/5 text-left">
          <p class="text-xs font-semibold text-navy/50 mb-2">已加入成员（{{ members.length }}）</p>
          <div class="space-y-2">
            <div
              v-for="(m, i) in members"
              :key="i"
              class="flex items-center gap-2 p-2 rounded-lg bg-cream/50"
            >
              <span class="w-8 h-8 grid place-items-center rounded-full bg-coral text-white text-sm font-bold">
                {{ m.nickname.charAt(0).toUpperCase() }}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-navy truncate">{{ m.nickname }}</p>
                <div v-if="m.preferences.length" class="flex flex-wrap gap-1 mt-0.5">
                  <span
                    v-for="p in m.preferences.slice(0, 3)"
                    :key="p"
                    class="text-xs px-1.5 py-0.5 rounded bg-navy/5 text-navy/60"
                  >
                    {{ p }}
                  </span>
                  <span v-if="m.preferences.length > 3" class="text-xs text-navy/40">
                    +{{ m.preferences.length - 3 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6">
          <BaseButton variant="ghost" size="sm" @click="router.push({ name: 'home' })">
            返回首页
          </BaseButton>
        </div>
      </BaseCard>

      <!-- 加入表单 -->
      <BaseCard v-else padding="lg">
        <form @submit.prevent="handleJoin" class="space-y-5">
          <!-- 昵称 -->
          <BaseInput
            v-model="nickname"
            label="你的昵称"
            placeholder="例如：小明"
            required
          />

          <!-- 偏好标签 -->
          <div>
            <label class="block mb-2.5 text-sm font-semibold text-navy">
              你的偏好
              <span class="font-normal text-navy/40">（可多选）</span>
            </label>
            <div class="flex flex-wrap gap-2">
              <BaseTag
                v-for="opt in preferenceOptions"
                :key="opt.label"
                :emoji="opt.emoji"
                :selected="preferences.includes(opt.label)"
                @click="togglePreference(opt.label)"
              >
                {{ opt.label }}
              </BaseTag>
            </div>
          </div>

          <!-- 提交 -->
          <BaseButton type="submit" size="lg" class="w-full" :disabled="!nickname.trim()">
            ✨ 加入协同
          </BaseButton>
        </form>
      </BaseCard>
    </div>
  </div>
</template>
