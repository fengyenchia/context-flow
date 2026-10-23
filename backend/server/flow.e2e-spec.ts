import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/api/[...path]/route';
import { state } from './state';

const { emails, generateContent } = vi.hoisted(() => ({ emails: [] as string[], generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
afterEach(() => vi.unstubAllEnvs());
let clientNumber = 0;
vi.mock('./email', () => ({
  brandedEmail: () => '',
  sendEmail: async (input: { text: string }) => {
    emails.push(input.text);
  },
}));

async function call(
  method: string,
  path: string,
  data?: unknown,
  token?: string,
  cookie?: string,
) {
  const request = new NextRequest(`http://localhost/api/${path}`, {
    method,
    headers: {
      'x-forwarded-for': `127.0.0.${clientNumber}`,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const handler =
    method === 'GET'
      ? GET
      : method === 'PUT'
        ? PUT
        : method === 'PATCH'
          ? PATCH
          : method === 'DELETE'
            ? DELETE
            : POST;
  return handler(request, {
    params: Promise.resolve({ path: path.split('?')[0].split('/') }),
  });
}

async function account(username: string) {
  const password = 'Test-password-123';
  const registered = await call('POST', 'auth/register', {
    username,
    password,
    displayName: username,
    email: `${username}@example.test`,
  });
  expect(registered.status).toBe(201);
  expect(
    (await call('POST', 'auth/login', { username, password })).status,
  ).toBe(403);
  const token = emails.at(-1)!.match(/token=([\w-]+)/)![1];
  expect((await call('GET', `auth/verify-email?token=${token}`)).status).toBe(
    200,
  );
  const response = await call('POST', 'auth/login', { username, password });
  expect(response.status).toBe(200);
  return {
    ...(await response.json()),
    cookie: response.headers.get('set-cookie')!.split(';')[0],
  };
}

describe('Authentication -> workspaces -> projects -> canvas API', () => {
  it('preserves the last active administrator', async () => {
    const session = await account('administrator');
    state.user(session.user.id).role = 'admin';
    expect((await call('PATCH', `admin/users/${session.user.id}/role`, { role: 'user' }, session.accessToken)).status).toBe(400);
    expect(state.user(session.user.id).role).toBe('admin');
  });
  it('rejects an outdated canvas revision without overwriting the latest snapshot', async () => {
    const owner = await account('revision');
    const workspace = [...state.workspaces.values()][0];
    const project = await (
      await call(
        'POST',
        `workspaces/${workspace.id}/projects`,
        { name: 'Revision' },
        owner.accessToken,
      )
    ).json();
    const first = await (
      await call(
        'PUT',
        `projects/${project.id}/canvas`,
        { nodes: [], edges: [], summary: 'First', baseUpdatedAt: null },
        owner.accessToken,
      )
    ).json();
    expect(
      (
        await call(
          'PUT',
          `projects/${project.id}/canvas`,
          {
            nodes: [],
            edges: [],
            summary: 'Second',
            baseUpdatedAt: first.updatedAt,
          },
          owner.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'PUT',
          `projects/${project.id}/canvas`,
          {
            nodes: [],
            edges: [],
            summary: 'Stale',
            baseUpdatedAt: first.updatedAt,
          },
          owner.accessToken,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await (
          await call(
            'GET',
            `projects/${project.id}/canvas`,
            undefined,
            owner.accessToken,
          )
        ).json()
      ).summary,
    ).toBe('Second');
  });
  it('manages shared roles, enforces viewer writes, updates and deletes projects', async () => {
    const owner = await account('manager');
    const member = await account('viewer');
    const workspace = await (
      await call('POST', 'workspaces', { name: 'Shared' }, owner.accessToken)
    ).json();
    const invitation = await (
      await call(
        'POST',
        `workspaces/${workspace.id}/invitations`,
        { username: 'viewer', role: 'viewer' },
        owner.accessToken,
      )
    ).json();
    expect(
      (
        await call(
          'POST',
          `workspace-invitations/${invitation.id}/accept`,
          undefined,
          member.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      await (
        await call(
          'GET',
          `workspaces/${workspace.id}/members`,
          undefined,
          owner.accessToken,
        )
      ).json(),
    ).toHaveLength(2);
    const project = await (
      await call(
        'POST',
        `workspaces/${workspace.id}/projects`,
        { name: 'Original' },
        owner.accessToken,
      )
    ).json();
    expect(
      (
        await call(
          'PUT',
          `projects/${project.id}/canvas`,
          { nodes: [], edges: [] },
          member.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          'DELETE',
          `projects/${project.id}`,
          undefined,
          member.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          'PATCH',
          `projects/${project.id}`,
          { name: 'Renamed', description: 'Updated' },
          owner.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'PATCH',
          `workspaces/${workspace.id}/members/${member.user.id}`,
          { role: 'editor' },
          owner.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'PATCH',
          `workspaces/${workspace.id}/members/${owner.user.id}`,
          { role: 'viewer' },
          member.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          'POST',
          `workspaces/${workspace.id}/projects`,
          { name: 'Editor project' },
          member.accessToken,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          'DELETE',
          `workspaces/${workspace.id}/members/${member.user.id}`,
          undefined,
          member.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'GET',
          `workspaces/${workspace.id}/projects`,
          undefined,
          member.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          'DELETE',
          `projects/${project.id}`,
          undefined,
          owner.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'GET',
          `projects/${project.id}`,
          undefined,
          owner.accessToken,
        )
      ).status,
    ).toBe(404);
  });

  it('returns 503 and rolls back a mutation when database persistence fails', async () => {
    const owner = await account('failure');
    const workspace = [...state.workspaces.values()][0];
    const spy = vi
      .spyOn(state, 'persist')
      .mockRejectedValueOnce(new Error('offline'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        (
          await call(
            'POST',
            `workspaces/${workspace.id}/projects`,
            { name: 'Must not exist' },
            owner.accessToken,
          )
        ).status,
      ).toBe(503);
      expect(state.projects.size).toBe(0);
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
  });

  it('resends verification, invalidates old links, and reports missing R2 without fake uploads', async () => {
    const input = {
      username: 'resend',
      email: 'resend@example.test',
      password: 'Test-password-123',
      displayName: 'Resend',
    };
    expect((await call('POST', 'auth/register', input)).status).toBe(201);
    const oldToken = emails.at(-1)!.match(/token=([\w-]+)/)![1];
    expect((await call('POST', 'auth/resend-verification', input)).status).toBe(
      200,
    );
    const token = emails.at(-1)!.match(/token=([\w-]+)/)![1];
    expect(token).not.toBe(oldToken);
    expect(
      (await call('GET', `auth/verify-email?token=${oldToken}`)).status,
    ).toBe(400);
    expect((await call('GET', `auth/verify-email?token=${token}`)).status).toBe(
      200,
    );
    const session = await (await call('POST', 'auth/login', input)).json();
    const workspace = [...state.workspaces.values()][0];
    const project = await (
      await call(
        'POST',
        `workspaces/${workspace.id}/projects`,
        { name: 'Files' },
        session.accessToken,
      )
    ).json();
    expect(
      (
        await call(
          'POST',
          `projects/${project.id}/files/upload`,
          { name: 'test.pdf', size: 12, mimeType: 'application/pdf' },
          session.accessToken,
        )
      ).status,
    ).toBe(503);
    expect(state.documents.size).toBe(0);
  });
  beforeEach(() => {
    clientNumber++;
    for (const collection of [
      state.users,
      state.workspaces,
      state.memberships,
      state.projects,
      state.invitations,
      state.sessions,
      state.credentials,
      state.resets,
      state.emailVerifications,
      state.canvasSnapshots,
    ])
      collection.clear();
    emails.length = 0;
    generateContent.mockReset().mockResolvedValue({ text: '測試 AI 回覆' });
    vi.stubEnv('USER_API_KEY_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  });

  it('validates, encrypts, masks and deletes the account Gemini key', async () => {
    const session = await account('ai_key_owner');
    const key = 'AIza_test-only-secret-123456';
    const response = await call('PUT', 'account/ai-credentials/gemini', { apiKey: key }, session.accessToken);
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain(key);
    expect(state.credentials.get(session.user.id)?.encryptedApiKey).not.toBe(key);
    expect(state.credentials.get(session.user.id)?.encryptedApiKey).toBeTruthy();
    const listed = await call('GET', 'account/ai-credentials', undefined, session.accessToken);
    expect(JSON.stringify(await listed.json())).not.toContain(key);
    const chat = await call('POST', 'ai/chat', { prompt: '整理下一步' }, session.accessToken);
    expect(chat.status).toBe(200);
    expect((await chat.json()).content).toBe('測試 AI 回覆');
    expect(generateContent).toHaveBeenLastCalledWith(expect.objectContaining({ contents: '整理下一步' }));
    expect((await call('DELETE', 'account/ai-credentials/gemini', undefined, session.accessToken)).status).toBe(200);
    expect(state.credentials.has(session.user.id)).toBe(false);
    expect((await call('POST', 'ai/chat', { prompt: '整理' }, session.accessToken)).status).toBe(400);
  });

  it('does not overwrite an existing credential when replacement validation fails', async () => {
    const session = await account('ai_invalid');
    await call('PUT', 'account/ai-credentials/gemini', { apiKey: 'AIza_valid-test-key-12345' }, session.accessToken);
    const previous = structuredClone(state.credentials.get(session.user.id));
    generateContent.mockRejectedValueOnce(new Error('invalid API key private-key-value'));
    const response = await call('PUT', 'account/ai-credentials/gemini', { apiKey: 'AIza_invalid-test-key-12345' }, session.accessToken);
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain('private-key-value');
    expect(state.credentials.get(session.user.id)).toEqual(previous);
  });

  it('rejects empty prompts and unauthorized projects before making a provider request', async () => {
    const owner = await account('ai_project_owner');
    const other = await account('ai_outsider');
    await call('PUT', 'account/ai-credentials/gemini', { apiKey: 'AIza_valid-test-key-12345' }, other.accessToken);
    const workspace = [...state.workspaces.values()].find((item) => item.createdByUserId === owner.user.id)!;
    const project = await (await call('POST', `workspaces/${workspace.id}/projects`, { name: 'Private' }, owner.accessToken)).json();
    generateContent.mockClear();
    expect((await call('POST', 'ai/chat', { projectId: project.id, prompt: 'private' }, other.accessToken)).status).toBe(403);
    expect((await call('POST', 'ai/chat', { prompt: '' }, other.accessToken)).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    [429, 429, '額度或頻率'], [403, 400, '無效或沒有權限'],
    [404, 400, '不存在或不可用'], [503, 502, '暫時無法回應'],
  ])('normalizes provider status %s for chat and saved-key tests without leaking SDK details', async (providerStatus, expectedStatus, message) => {
    const session = await account(`ai_failure_${providerStatus}`);
    await call('PUT', 'account/ai-credentials/gemini', { apiKey: 'AIza_valid-test-key-12345' }, session.accessToken);
    for (const path of ['ai/chat', 'account/ai-credentials/gemini/test', 'account/ai-credentials/gemini']) {
      generateContent.mockRejectedValueOnce(Object.assign(new Error('private-provider-diagnostic'), { status: providerStatus }));
      const replacement = path === 'account/ai-credentials/gemini';
      const response = await call(replacement ? 'PUT' : 'POST', path, replacement ? { apiKey: 'AIza_replacement-test-key-12345' } : path === 'ai/chat' ? { prompt: '測試' } : undefined, session.accessToken);
      expect(response.status).toBe(expectedStatus);
      const body = await response.json();
      expect(body.message).toContain(message);
      expect(body.message).not.toContain('private-provider-diagnostic');
    }
  });

  it('verifies email, bootstraps personal space, saves all canvas areas and rotates/revokes refresh cookies', async () => {
    const session = await account('owner');
    const personal = await (
      await call('GET', 'workspaces', undefined, session.accessToken)
    ).json();
    expect(personal).toHaveLength(1);
    expect(personal[0]).toMatchObject({ kind: 'personal', role: 'owner' });
    const workspace = await (
      await call('POST', 'workspaces', { name: 'Shared' }, session.accessToken)
    ).json();
    const project = await (
      await call(
        'POST',
        `workspaces/${workspace.id}/projects`,
        { name: 'Project' },
        session.accessToken,
      )
    ).json();
    const snapshot = {
      nodes: [
        {
          id: 'zone-1',
          position: { x: 10, y: 20 },
          data: { nodeTitle: 'Root', nodeContent: 'Content' },
          style: { background: '#e8f5ee' },
        },
        {
          id: 'diverge-1',
          position: { x: 30, y: 40 },
          data: { nodeTitle: 'Idea' },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'zone-1',
          target: 'diverge-1',
          style: { stroke: '#d97887' },
        },
      ],
      convergenceNodes: [
        {
          id: 'converge-1',
          position: { x: 1, y: 2 },
          data: { nodeTitle: 'Decision' },
        },
      ],
      convergenceEdges: [],
      resources: [
        {
          id: 'resource-1',
          kind: 'text',
          title: 'Source',
          content: 'Original',
        },
      ],
      conversations: { global: ['question', 'answer'] },
      summary: 'Summary',
    };
    expect(
      (
        await call(
          'PUT',
          `projects/${project.id}/canvas`,
          { ...snapshot, baseUpdatedAt: null },
          session.accessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      await (
        await call(
          'GET',
          `projects/${project.id}/canvas`,
          undefined,
          session.accessToken,
        )
      ).json(),
    ).toMatchObject(snapshot);
    expect(
      (
        await call(
          'PUT',
          `projects/${project.id}/canvas`,
          { nodes: 'bad' },
          session.accessToken,
        )
      ).status,
    ).toBe(400);
    const refreshed = await call(
      'POST',
      'auth/refresh',
      undefined,
      undefined,
      session.cookie,
    );
    expect(refreshed.status).toBe(200);
    expect(
      (await call('POST', 'auth/refresh', undefined, undefined, session.cookie))
        .status,
    ).toBe(401);
    const cookie = refreshed.headers.get('set-cookie')!.split(';')[0];
    expect(
      (await call('POST', 'auth/logout', undefined, undefined, cookie)).status,
    ).toBe(200);
    expect(
      (await call('POST', 'auth/refresh', undefined, undefined, cookie)).status,
    ).toBe(401);
  });

  it('rejects missing auth, incorrect passwords and cross-workspace access', async () => {
    expect((await call('GET', 'workspaces')).status).toBe(401);
    const owner = await account('owner');
    const other = await account('other');
    expect(
      (
        await call('POST', 'auth/login', {
          username: 'owner',
          password: 'wrong-password',
        })
      ).status,
    ).toBe(401);
    const workspace = [...state.workspaces.values()].find(
      (item) => item.createdByUserId === owner.user.id,
    )!;
    expect(
      (
        await call(
          'POST',
          `workspaces/${workspace.id}/projects`,
          { name: 'Forbidden' },
          other.accessToken,
        )
      ).status,
    ).toBe(403);
    const project = await (
      await call(
        'POST',
        `workspaces/${workspace.id}/projects`,
        { name: 'Private' },
        owner.accessToken,
      )
    ).json();
    expect(
      (
        await call(
          'GET',
          `projects/${project.id}/canvas`,
          undefined,
          other.accessToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          'PUT',
          `projects/${project.id}/canvas`,
          { nodes: [], edges: [] },
          other.accessToken,
        )
      ).status,
    ).toBe(403);
  });
});
