import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { planRouter } from './routes/plan.js'

const app = express()

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      aiModel: config.ai.model
    }
  })
})

// 行程生成路由
app.use('/api/plan', planRouter)

// 错误处理
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err)
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  })
})

app.listen(config.port, () => {
  console.log(`🚀 后端服务已启动: http://localhost:${config.port}`)
  console.log(`📋 AI 模型: ${config.ai.model}`)
})
