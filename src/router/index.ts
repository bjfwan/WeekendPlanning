import { createRouter, createWebHistory } from 'vue-router'

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
      path: '/join/:code',
      name: 'join',
      component: () => import('@/views/JoinView.vue')
    }
  ]
})

export default router
