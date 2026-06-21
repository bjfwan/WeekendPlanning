import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

if (!config.supabase.url || !config.supabase.serviceKey) {
  throw new Error('缺少 Supabase 服务端配置，请检查 server/.env 中的 SUPABASE_URL 和 SUPABASE_SERVICE_KEY')
}

/**
 * 服务端 Supabase 客户端单例
 * 使用 service_role key，绕过 RLS，仅在服务端使用，切勿暴露到前端
 */
export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})
