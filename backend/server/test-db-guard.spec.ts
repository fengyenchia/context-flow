import { describe, expect, it } from 'vitest';
import {
  assertTestDatabaseIsIsolated,
  assertTestDatabaseTarget,
  databaseTarget,
} from '../../scripts/test-db-guard.mjs';

const production =
  'postgresql://owner:secret@ep-production.us-east-1.aws.neon.tech/neondb?sslmode=require';
describe('test database safety (no database connections)', () => {
  it('refuses missing test or production configuration', () => {
    expect(() => assertTestDatabaseIsIsolated(undefined, production)).toThrow(
      'TEST_DATABASE_URL',
    );
    expect(() => assertTestDatabaseIsIsolated(production, undefined)).toThrow(
      '缺少原本',
    );
  });
  it('rejects the exact production URL', () => {
    expect(() => assertTestDatabaseIsIsolated(production, production)).toThrow(
      '相同目標',
    );
  });
  it('rejects pooled aliases, changed credentials, protocol and query parameters', () => {
    expect(() =>
      assertTestDatabaseIsIsolated(
        'postgres://other:changed@ep-production-pooler.us-east-1.aws.neon.tech/neondb?channel_binding=require',
        production,
      ),
    ).toThrow('相同目標');
  });
  it('requires a separate Neon endpoint even with a different database name', () => {
    expect(() =>
      assertTestDatabaseIsIsolated(
        production.replace('/neondb', '/testdb'),
        production,
      ),
    ).toThrow('相同目標');
  });
  it('accepts a separate Neon endpoint', () => {
    expect(() =>
      assertTestDatabaseIsIsolated(
        production.replace('ep-production', 'ep-disposable'),
        production,
      ),
    ).not.toThrow();
  });
  it('normalizes non-Neon host case, credentials, default ports and encoded names', () => {
    expect(() =>
      assertTestDatabaseIsIsolated(
        'postgres://other:changed@%64b.example/db',
        'postgres://owner:secret@db.example/db',
      ),
    ).toThrow('相同目標');
    expect(() =>
      databaseTarget('postgres://owner:secret@first.example,second.example/db'),
    ).toThrow('多主機');
    expect(() =>
      assertTestDatabaseIsIsolated(
        'postgres://other:changed@DB.EXAMPLE:5432/%64b?sslmode=require',
        'postgresql://owner:secret@db.example/db',
      ),
    ).toThrow('相同目標');
    expect(() =>
      assertTestDatabaseIsIsolated(
        'postgres://owner:secret@db.example/test',
        'postgres://owner:secret@db.example/production',
      ),
    ).not.toThrow();
  });
  it('rejects connection-target query overrides', () => {
    for (const key of [
      'host',
      'hostaddr',
      'options',
      'dbname',
      'port',
      'service',
    ])
      expect(() =>
        databaseTarget(
          `postgres://owner:secret@test.example/test?${key}=hidden`,
        ),
      ).toThrow('覆寫');
  });
  it('rejects invalid protocols and does not disclose connection secrets', () => {
    for (const value of [
      'https://owner:private@test.example/db',
      'invalid-private',
      'postgres://owner:private@test.example/%xx',
    ]) {
      expect(() => databaseTarget(value)).toThrow();
      try {
        databaseTarget(value);
      } catch (error) {
        expect(String(error)).not.toContain('private');
      }
    }
    expect(() => databaseTarget('https://test.example/db')).toThrow(
      'PostgreSQL',
    );
  });
  it('refuses direct test execution without the guarded runner', () => {
    expect(() => assertTestDatabaseTarget(production, undefined)).toThrow(
      'pnpm test:db',
    );
  });
});
