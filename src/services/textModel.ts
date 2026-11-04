import { getPromptBook } from './prompts'
import { ValidationError } from './validation'
export interface TextUsage {
  prompt_tokens?: number
  completion_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number }
  cost?: number
}
export class TextModelError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = 'TextModelError' }
}
export async function callText(system: string, user: string): Promise<{ text: string; usage: TextUsage }> {
  const book = getPromptBook()
  const index = Object.values(book.systems).indexOf(system)
  const step = ['拆解剧本', '提取角色与场景', '生成镜头设计'][index]
  if (!step) throw new Error('无法识别文本模型步骤')
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 300000)
  try {
    const response = await fetch('/api/openrouter/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Phanthy-Step': encodeURIComponent(step) },
      body: JSON.stringify({ model: __TEXT_MODEL__, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], usage: { include: true } }), signal: controller.signal,
    })
    const data = await response.json().catch(() => { throw new TextModelError('文本模型返回了无效响应', response.status) })
    const usage: TextUsage = data.usage ?? {}
    console.info(`[文本模型] ${step} 输入 ${usage.prompt_tokens ?? '未知'} / 输出 ${usage.completion_tokens ?? '未知'} / 思考 ${usage.completion_tokens_details?.reasoning_tokens ?? '未知'} token；费用 ${usage.cost == null ? '未知' : '$' + usage.cost}`)
    if (!response.ok || data.error) throw new TextModelError(data.error?.message || `文本模型请求失败（${response.status}）`, response.status)
    if (typeof data.choices?.[0]?.message?.content !== 'string') throw new ValidationError(['模型没有返回文本'])
    return { text: data.choices[0].message.content, usage }
  } catch (error) {
    if (error instanceof TextModelError || error instanceof ValidationError) throw error
    throw new TextModelError(controller.signal.aborted ? '文本模型请求超时（300 秒）' : '文本模型网络请求失败，请手动重试')
  } finally {
    clearTimeout(timeout)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('phanthy:usage'))
  }
}
// Only parsing/validation failures retry; network errors and budget rejections never do.
export async function validatedText<T>(request: { system: string; user: string }, mock: () => string, parse: (text: string) => T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let text = ''
    try {
      text = __REAL_TEXT__ ? (await callText(request.system, request.user)).text : mock()
      return parse(text)
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      console.error('[文本校验失败]', { attempt: attempt + 1, errors: error.errors, raw: error.raw || text })
      if (attempt >= 1) throw error
    }
  }
}
