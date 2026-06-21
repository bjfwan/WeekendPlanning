import { app } from '../server/src/app.js'

// Vercel Serverless Function 入口
// 所有 /api/* 请求通过 vercel.json rewrites 转发到这里，由 Express app 处理路由
export default app
