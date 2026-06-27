import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    },
    {
      path: '/plan',
      name: 'plan',
      component: () => import('@/views/PlanView.vue')
    },
    {
      path: '/plan/:code',
      name: 'plan-detail',
      component: () => import('@/views/PlanDetailView.vue')
    },
    {
      path: '/join/:code',
      name: 'join',
      component: () => import('@/views/JoinView.vue'),
      meta: { layout: 'centered' as const }
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('@/views/HistoryView.vue')
    }
  ]
})

// 全局前置守卫：每次导航前确保匿名 session 存在
// 不阻止导航，仅保证有匿名身份
router.beforeEach(async () => {
  const { ensureSession } = useAuth()
  await ensureSession()
})

export default router
