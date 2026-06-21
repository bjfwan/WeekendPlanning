import { ref } from 'vue'
import type { Plan, SSEMeta, SSEChunk, SSEDone, SSEError } from '@weekend-planner/shared'

/** 流式状态 */
export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

/** SSE 事件回调 */
interface UseStreamCallbacks {
  onMeta?: (meta: SSEMeta) => void
  onChunk?: (chunk: SSEChunk) => void
  onDone?: (done: SSEDone) => void
  onError?: (error: SSEError) => void
}

/** 解析后的单个 SSE 事件 */
interface ParsedEvent {
  event: string
  data: string
}

/**
 * 解析 SSE 文本缓冲区，返回完整事件与剩余不完整片段
 */
function parseSSEBuffer(buffer: string): { events: ParsedEvent[]; remaining: string } {
  const events: ParsedEvent[] = []
  // 事件之间以空行（\n\n）分隔
  const blocks = buffer.split('\n\n')
  // 最后一块可能不完整，保留到下次拼接
  const remaining = blocks.pop() ?? ''

  for (const block of blocks) {
    if (!block.trim()) continue
    let event = 'message'
    let data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim()
      }
    }
    events.push({ event, data })
  }

  return { events, remaining }
}

/**
 * SSE 流式接收 composable
 * 使用 fetch + ReadableStream 接收服务端 SSE 事件
 */
export function useStream() {
  const content = ref<string>('')
  const plan = ref<Plan | null>(null)
  const status = ref<StreamStatus>('idle')
  const error = ref<string>('')
  const meta = ref<SSEMeta | null>(null)

  let controller: AbortController | null = null

  /**
   * 发起流式请求
   * @param url 请求地址
   * @param body 请求体（会被 JSON 序列化）
   * @param callbacks SSE 事件回调
   */
  async function start(
    url: string,
    body: unknown,
    callbacks?: UseStreamCallbacks
  ): Promise<void> {
    // 重置状态
    content.value = ''
    plan.value = null
    status.value = 'streaming'
    error.value = ''
    meta.value = null

    controller = new AbortController()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`请求失败（HTTP ${response.status}）`)
      }

      if (!response.body) {
        throw new Error('当前响应不支持流式读取')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const { events, remaining } = parseSSEBuffer(buffer)
        buffer = remaining

        for (const evt of events) {
          if (!evt.data) continue
          try {
            const payload = JSON.parse(evt.data)
            switch (evt.event) {
              case 'meta':
                meta.value = payload as SSEMeta
                callbacks?.onMeta?.(payload as SSEMeta)
                break
              case 'chunk': {
                const chunk = payload as SSEChunk
                content.value += chunk.content
                callbacks?.onChunk?.(chunk)
                break
              }
              case 'done':
                plan.value = (payload as SSEDone).plan
                status.value = 'done'
                callbacks?.onDone?.(payload as SSEDone)
                break
              case 'error': {
                const err = payload as SSEError
                error.value = err.message
                status.value = 'error'
                callbacks?.onError?.(err)
                break
              }
            }
          } catch {
            // JSON 解析失败，跳过该事件
          }
        }
      }

      // 流读取结束，若仍未收到 done 事件则视为异常断开
      if (status.value === 'streaming') {
        if (plan.value) {
          status.value = 'done'
        } else {
          error.value = '连接已断开，请重试'
          status.value = 'error'
        }
      }
    } catch (err) {
      // 用户主动取消
      if (controller?.signal.aborted) {
        status.value = 'idle'
      } else {
        error.value = err instanceof Error ? err.message : '未知错误'
        status.value = 'error'
      }
    } finally {
      controller = null
    }
  }

  /** 取消请求 */
  function cancel(): void {
    if (controller) {
      controller.abort()
      controller = null
      status.value = 'idle'
    }
  }

  /** 重置全部状态 */
  function reset(): void {
    cancel()
    content.value = ''
    plan.value = null
    status.value = 'idle'
    error.value = ''
    meta.value = null
  }

  return {
    content,
    plan,
    status,
    error,
    meta,
    start,
    cancel,
    reset
  }
}
