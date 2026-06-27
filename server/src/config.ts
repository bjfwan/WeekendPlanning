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
    model: process.env.AI_MODEL || 'deepseek-ai/DeepSeek-V4-Flash'
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

/**
 * 启动期 fail-fast 配置校验
 * 收集所有缺失的关键配置项后一次性打印并退出
 */
export function validateConfig(): void {
  const missing: string[] = []

  if (!config.ai.apiKey) {
    missing.push('AI_API_KEY（AI 调用必需，请在 server/.env 中设置）')
  }
  if (!config.amap.serverKey) {
    missing.push('AMAP_SERVER_KEY（坐标补充必需，请在 server/.env 中设置）')
  }
  if (!config.supabase.url) {
    missing.push('SUPABASE_URL（数据存储必需，请在 server/.env 中设置）')
  }
  if (!config.supabase.serviceKey) {
    missing.push('SUPABASE_SERVICE_KEY（数据存储必需，请在 server/.env 中设置）')
  }

  if (missing.length > 0) {
    console.error('❌ 配置校验失败，以下关键配置项未配置：')
    missing.forEach((item) => console.error(`  ❌ ${item}`))
    process.exit(1)
  }

  console.log('✓ 配置校验通过')
}
