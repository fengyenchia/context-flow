import { describe, expect, it } from 'vitest';
import { armOnboarding, finishTour, shouldStartTour, tourProgressKey } from './tour-progress';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('onboarding progress', () => {
  it('only automatically guides registered new users, independently by account and stage', () => {
    const browser = storage();
    expect(shouldStartTour('new', 'workspace', browser)).toBe(false);
    armOnboarding('new', browser);
    expect(shouldStartTour('new', 'workspace', browser)).toBe(true);
    expect(shouldStartTour('other', 'workspace', browser)).toBe(false);
    finishTour('new', 'workspace', 'finished', browser);
    expect(shouldStartTour('new', 'workspace', browser)).toBe(false);
    expect(shouldStartTour('new', 'canvas', browser)).toBe(true);
    finishTour('new', 'canvas', 'finished', browser);
    expect(shouldStartTour('new', 'canvas', browser)).toBe(false);
    expect(browser.getItem(tourProgressKey('new'))).toContain('finished');
  });
  it('respects skipping the introduction and does not automatically open the next stage', () => {
    const browser = storage();
    armOnboarding('skip', browser);
    finishTour('skip', 'workspace', 'skipped', browser);
    expect(shouldStartTour('skip', 'workspace', browser)).toBe(false);
    expect(shouldStartTour('skip', 'canvas', browser)).toBe(false);
  });
  it('survives invalid storage and falls back to session progress when storage is denied', () => {
    const browser = storage();
    browser.setItem(tourProgressKey('invalid'), 'not-json');
    expect(shouldStartTour('invalid', 'workspace', browser)).toBe(false);
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => armOnboarding('denied', denied)).not.toThrow();
    expect(shouldStartTour('denied', 'workspace', denied)).toBe(true);
    finishTour('denied', 'workspace', 'skipped', denied);
    expect(shouldStartTour('denied', 'canvas', denied)).toBe(false);
    const quota = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    armOnboarding('quota', quota);
    expect(shouldStartTour('quota', 'workspace', quota)).toBe(true);
    const oldRecord = { getItem: () => JSON.stringify({ pending: true }), setItem: () => { throw new Error('quota'); } };
    finishTour('old-record', 'workspace', 'skipped', oldRecord);
    expect(shouldStartTour('old-record', 'canvas', oldRecord)).toBe(false);
  });
});
