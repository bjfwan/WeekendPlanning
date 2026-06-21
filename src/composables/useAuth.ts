/**
 * 匿名登录 composable
 * 模块级单例，跨页面共享同一份认证状态
 */
import { ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// 模块级单例状态（不在函数内部声明 ref）
const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const loading = ref<boolean>(false)

// 标记是否已初始化监听器，避免重复注册
let listenerInitialized = false

/**
 * 初始化 auth 状态变更监听
 * 仅注册一次，后续调用直接返回
 */
function initListener(): void {
  if (listenerInitialized) return
  listenerInitialized = true

  // 监听认证状态变化，同步到响应式 ref
  supabase.auth.onAuthStateChange((_event, newSession) => {
    session.value = newSession
    user.value = newSession?.user ?? null
  })
}

/**
 * 匿名登录
 * 调用 Supabase 匿名登录 API，捕获错误
 */
async function signInAnonymously(): Promise<void> {
  loading.value = true
  try {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('匿名登录失败：', error.message)
      return
    }
    session.value = data.session
    user.value = data.user
  } catch (err) {
    console.error('匿名登录异常：', err)
  } finally {
    loading.value = false
  }
}

/**
 * 确保已存在 session，否则自动匿名登录
 * 应用启动和路由跳转前调用
 */
async function ensureSession(): Promise<void> {
  initListener()

  // 先尝试从本地存储恢复 session
  loading.value = true
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      session.value = data.session
      user.value = data.session.user
      return
    }
    // 没有 session 则匿名登录
    await signInAnonymously()
  } finally {
    loading.value = false
  }
}

/**
 * 认证 composable
 * 返回模块级单例状态与操作方法
 */
export function useAuth() {
  return {
    user,
    session,
    loading,
    signInAnonymously,
    ensureSession
  }
}
