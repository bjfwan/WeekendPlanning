import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { config } from './config.js'
import { planRouter } from './routes/plan.js'
import { shareRouter } from './routes/share.js'
import { optionalAuth } from './middleware/auth.js'

const app = express()

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 健康检查
app.get('/api/health', (_req: Request, res: Response) => {
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

// 行程分享与协同偏好路由（可选 JWT 校验，由具体路由决定是否需要登录）
app.use('/api/plan', optionalAuth, shareRouter)

// 错误处理
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err)
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  })
})

export { app }
