import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../src/db/client', () => ({ db: { select: mock.select } }));
import { originalFileReferences } from './original-file-references';
beforeEach(() => { vi.clearAllMocks(); });
function query(rows: Array<{ id?: string; key?: string }>) {
  return { from: () => ({ where: () => ({ limit: async () => rows, then: (resolve: (value: typeof rows) => unknown) => Promise.resolve(rows).then(resolve) }) }) };
}
it('reads the authoritative database for project existence instead of relying on cached state', async () => {
  mock.select.mockReturnValueOnce(query([{ id: 'restored-project' }]));
  expect(await originalFileReferences('restored-project')).toEqual({ projectExists: true, protectedKeys: new Set() });
  expect(mock.select).toHaveBeenCalledOnce();
});
it('protects any matching document key even when its record belongs to another project', async () => {
  mock.select.mockReturnValueOnce(query([])).mockReturnValueOnce(query([{ key: 'projects/old/file' }]));
  expect(await originalFileReferences('old', ['projects/old/file'])).toEqual({ projectExists: false, protectedKeys: new Set(['projects/old/file']) });
});
it('propagates database failure instead of treating it as a missing project', async () => {
  mock.select.mockImplementationOnce(() => { throw new Error('Neon offline'); });
  await expect(originalFileReferences('old')).rejects.toThrow('Neon offline');
});
