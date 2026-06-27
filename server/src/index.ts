import { app } from './app.js'
import { config, validateConfig } from './config.js'

validateConfig()

app.listen(config.port, () => {
  console.log(`🚀 后端服务已启动: http://localhost:${config.port}`)
  console.log(`📋 AI 模型: ${config.ai.model}`)
})
