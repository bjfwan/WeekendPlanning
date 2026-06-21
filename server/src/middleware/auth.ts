import { type Request, type Response, type NextFunction } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

/**
 * 扩展 Express Request 类型，挂载已校验的用户信息
 */
declare module 'express' {
  interface Request {
    user?: { id: string } | null
  }
}

/**
 * 可选的 JWT 校验中间件
 * - 从 Authorization header 提取 Bearer token
 * - 调用 supabaseAdmin.auth.getUser(token) 校验
 * - 校验成功：将 user 挂到 req.user
 * - 校验失败：req.user = null（不阻断请求，由具体路由决定是否需要登录）
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null
      next()
      return
    }

    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) {
      req.user = null
      next()
      return
    }

    const {
      data: { user },
      error
    } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      req.user = null
      next()
      return
    }

    req.user = { id: user.id }
    next()
  } catch (err) {
    // 校验过程异常不阻断请求，仅记录日志
    console.warn('[optionalAuth] JWT 校验异常:', err instanceof Error ? err.message : err)
    req.user = null
    next()
  }
}
