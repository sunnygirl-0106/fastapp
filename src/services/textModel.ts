import { ValidationError } from './validation'
// Mock responses retain the same validation and retry contract.
export async function validatedText<T>(request: { system: string; user: string; onAttempt?: (attempt: number) => void }, mock: () => string, parse: (text: string) => T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let text = ''
    try {
      request.onAttempt?.(attempt + 1)
      text = mock()
      return parse(text)
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      console.error('[文本校验失败]', { attempt: attempt + 1, errors: error.errors, raw: error.raw || text })
      if (attempt >= 1) throw error
    }
  }
}
