<script setup lang="ts">
// 多人偏好加入页（通过分享码加入）
import { useRoute } from 'vue-router'

const route = useRoute()
const shareCode = route.params.code as string
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="max-w-md w-full text-center">
      <h1 class="font-display text-3xl font-bold text-navy mb-4">
        加入行程协同
      </h1>
      <p class="text-gray-600 mb-8">
        分享码：{{ shareCode }}
      </p>
      <div class="card">
        <p class="text-gray-500">偏好填写表单（待实现）</p>
      </div>
    </div>
  </div>
</template>
