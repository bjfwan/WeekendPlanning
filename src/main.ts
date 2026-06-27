import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'
import { vStagger } from '@/directives/vStagger'
import { vHoverCard } from '@/directives/vHoverCard'
import './style.css'

const { ensureSession } = useAuth()

function bootstrap(): void {
  const app = createApp(App)
  app.use(router)
  // 注册全局自定义指令
  app.directive('stagger', vStagger)
  app.directive('hover-card', vHoverCard)
  // 先挂载应用，避免 Supabase 匿名 session 恢复阻塞首屏渲染
  app.mount('#app')
  // 异步恢复 session（fire-and-forget）：路由守卫 beforeEach 仍会 await ensureSession，保证进入业务页前有 session
  void ensureSession()
}

bootstrap()
