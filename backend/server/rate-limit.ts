import { ApiProblem } from './state';

const attempts = new Map<string, { count: number; expires: number }>();
export function enforceAuthRate(
  route: string,
  address: string,
  now = Date.now(),
) {
  if (
    ![
      'auth/login',
      'auth/register',
      'auth/forgot-password',
      'auth/reset-password',
      'auth/resend-verification',
    ].includes(route)
  )
    return;
  for (const [key, entry] of attempts)
    if (entry.expires <= now) attempts.delete(key);
  const key = `${route}:${address}`;
  const entry = attempts.get(key) || { count: 0, expires: now + 15 * 60_000 };
  if (entry.count >= 30 || (!attempts.has(key) && attempts.size >= 10_000))
    throw new ApiProblem(429, '操作次數過多，請稍後再試');
  entry.count += 1;
  attempts.set(key, entry);
}
