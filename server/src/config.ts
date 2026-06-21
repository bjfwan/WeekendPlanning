import dotenv from 'dotenv'
dotenv.config()

/**
 * 后端配置（从环境变量读取）
 */
export const config = {
  port: Number(process.env.PORT) || 3000,

  // AI 接口配置（魔搭社区 ModelScope API-Inference）
  ai: {
    apiUrl: process.env.AI_API_URL || 'https://api-inference.modelscope.cn/v1/',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'Qwen/Qwen3.5-35B-A3B'
  },

  // 高德 Web 服务 Key
  amap: {
    serverKey: process.env.AMAP_SERVER_KEY || ''
  },

  // Supabase 配置
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || ''
  }
} as const
