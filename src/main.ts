import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'
import './style.css'

const { ensureSession } = useAuth()

// 改为 async：mount 前先恢复匿名 session
async function bootstrap(): Promise<void> {
  // 确保有匿名身份后再挂载应用
  await ensureSession()

  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
