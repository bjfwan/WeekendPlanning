import OpenAI from 'openai'
import { config } from '../config.js'

/**
 * AI 服务（基于魔搭 ModelScope，使用 OpenAI 兼容协议）
 */

/** 默认 AI 请求超时时间（毫秒） */
const AI_TIMEOUT_MS = 120_000

/**
 * 创建 OpenAI 客户端
 * @param overrides 用户自定义配置（可覆盖后端默认）
 */
function createClient(overrides?: { apiUrl?: string; apiKey?: string }): OpenAI {
  const baseURL = overrides?.apiUrl || config.ai.apiUrl
  const apiKey = overrides?.apiKey || config.ai.apiKey

  if (!apiKey) {
    throw new Error('AI API Key 未配置，请检查环境变量 AI_API_KEY')
  }

  return new OpenAI({
    baseURL,
    apiKey,
    timeout: AI_TIMEOUT_MS,
    maxRetries: 1
  })
}

/**
 * 获取当前使用的模型名称
 * @param overrides 用户自定义配置
 */
function resolveModel(overrides?: { model?: string }): string {
  return overrides?.model || config.ai.model
}

/**
 * 流式生成行程文本
 * @param prompt 行程生成 Prompt
 * @param onChunk 接收文本片段的回调（实际回答内容）
 * @param overrides 用户自定义 AI 配置
 * @param onReasoning 接收思考过程片段的回调（reasoning 模型的思考内容）
 * @returns 完整的 AI 响应文本
 */
export async function generatePlanStream(
  prompt: string,
  onChunk: (content: string) => void,
  overrides?: { apiUrl?: string; apiKey?: string; model?: string },
  onReasoning?: (content: string) => void
): Promise<string> {
  const client = createClient(overrides)
  const model = resolveModel(overrides)

  let fullText = ''

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        stream: true,
        messages: [
          {
            role: 'system',
            content:
              '你是一位资深的周末行程规划师，擅长根据用户需求生成结构化、可执行的周末出行方案。' +
              '必须严格按照用户要求的 JSON 格式输出，不要输出任何与 JSON 无关的内容。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        stream_options: { include_usage: false }
      },
      { timeout: AI_TIMEOUT_MS }
    )

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string | null; reasoning_content?: string | null }
        | undefined

      // 思考过程（reasoning 模型会先输出 reasoning_content）
      if (delta?.reasoning_content && onReasoning) {
        onReasoning(delta.reasoning_content)
      }

      // 实际回答内容
      if (delta?.content) {
        fullText += delta.content
        onChunk(delta.content)
      }
    }

    return fullText
  } catch (err) {
    // 统一错误信息
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? 'unknown'
      const message = err.message || 'AI 接口调用失败'
      throw new Error(`AI 接口错误 (${status}): ${message}`)
    }
    if (err instanceof Error) {
      // 超时 / 网络错误
      if (err.name === 'TimeoutError' || /timeout/i.test(err.message)) {
        throw new Error(`AI 请求超时（${AI_TIMEOUT_MS / 1000}s），请稍后重试`)
      }
      throw new Error(`AI 请求失败: ${err.message}`)
    }
    throw new Error('AI 请求发生未知错误')
  }
}
