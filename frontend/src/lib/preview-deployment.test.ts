import { describe, expect, it } from 'vitest';
import { assertPreviewApi } from './preview-deployment';

describe('Preview API deployment boundary', () => {
  it('rejects missing configuration, the production API and local or ambiguous endpoints', () => {
    for (const api of [undefined, '', 'invalid', 'https://api.context-flow.fengyenchia.com/api', 'https://API.CONTEXT-FLOW.FENGYENCHIA.COM/api/', 'http://preview.example.test/api', 'https://localhost/api', 'https://127.0.0.1/api', 'https://[::1]/api', 'https://preview.example.test', 'https://preview.example.test/api?key=private', 'https://user:private@preview.example.test/api']) {
      expect(() => assertPreviewApi({ VERCEL_ENV: 'preview', NEXT_PUBLIC_API_BASE_URL: api })).toThrow('Preview requires an isolated HTTPS API');
    }
  });
  it('accepts an explicitly configured Preview API and leaves production/local builds unchanged', () => {
    expect(() => assertPreviewApi({ VERCEL_ENV: 'preview', NEXT_PUBLIC_API_BASE_URL: 'https://api-preview.example.test/api/' })).not.toThrow();
    expect(() => assertPreviewApi({ VERCEL_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.context-flow.fengyenchia.com/api' })).not.toThrow();
    expect(() => assertPreviewApi({ NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api' })).not.toThrow();
  });
  it('never includes a rejected URL or embedded credential in the error', () => {
    const secret = 'do-not-log-this-value';
    try { assertPreviewApi({ VERCEL_ENV: 'preview', NEXT_PUBLIC_API_BASE_URL: `https://user:${secret}@preview.example.test/api` }); }
    catch (error) { expect(String(error)).not.toContain(secret); return; }
    throw Error('Unsafe Preview must be rejected');
  });
});
