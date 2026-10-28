type DeploymentEnvironment = {
  VERCEL_ENV?: string;
  NEXT_PUBLIC_API_BASE_URL?: string;
};

/** Prevent an unconfigured Preview from building a client for production. */
export function assertPreviewApi(environment: DeploymentEnvironment) {
  if (environment.VERCEL_ENV !== 'preview') return;
  const fail = () => { throw new Error('Preview requires an isolated HTTPS API ending in /api. Configure Preview resources before deploying; do not use the production API.'); };
  let url: URL;
  try { url = new URL(environment.NEXT_PUBLIC_API_BASE_URL || ''); } catch { return fail(); }
  if (url.protocol !== 'https:' || !/^\/api\/?$/.test(url.pathname) || url.username || url.password || url.search || url.hash ||
    url.hostname === 'api.context-flow.fengyenchia.com' || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '127.0.0.1' || url.hostname === '[::1]') fail();
}
