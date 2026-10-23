import { ApiProblem } from './state';

/** Never expose SDK responses (which may contain a key or provider internals). */
export function geminiFailure(error: unknown, model: string): ApiProblem {
  if (error instanceof ApiProblem) return error;
  const detail = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined;
  if (
    status === 429 ||
    /429|rate.?limit|quota|resource exhausted/i.test(detail)
  )
    return new ApiProblem(429, 'Gemini API 額度或頻率限制，請稍後再試');
  if (
    status === 401 ||
    status === 403 ||
    /401|403|api key|unauthoriz|permission/i.test(detail)
  )
    return new ApiProblem(400, 'Gemini API Key 無效或沒有權限');
  if (status === 404 || /404|not found|model/i.test(detail))
    return new ApiProblem(400, `Gemini 模型「${model}」不存在或不可用`);
  return new ApiProblem(502, 'Gemini 暫時無法回應，請稍後再試');
}
