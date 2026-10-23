export type TourStage = 'workspace' | 'canvas';
type Outcome = 'finished' | 'skipped';
type Progress = { pending?: boolean; workspace?: Outcome; canvas?: Outcome };
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
const sessionProgress = new Map<string, Progress>();

export const tourProgressKey = (userId: string) => `contextflow:onboarding:v1:${userId}`;

function read(userId: string, storage?: StorageAccess): Progress {
  const unsaved = sessionProgress.get(userId);
  if (unsaved) return unsaved;
  try {
    const saved = (storage ?? window.localStorage).getItem(tourProgressKey(userId));
    if (!saved) return sessionProgress.get(userId) ?? {};
    const raw: unknown = JSON.parse(saved);
    if (raw && typeof raw === 'object') {
      const item = raw as Record<string, unknown>;
      const outcome = (value: unknown) => value === 'finished' || value === 'skipped' ? value : undefined;
      return { pending: item.pending === true, workspace: outcome(item.workspace), canvas: outcome(item.canvas) };
    }
  } catch { /* Private browsing may deny storage; keep progress for this session. */ }
  return sessionProgress.get(userId) ?? {};
}

function write(userId: string, progress: Progress, storage?: StorageAccess) {
  try {
    (storage ?? window.localStorage).setItem(tourProgressKey(userId), JSON.stringify(progress));
    sessionProgress.delete(userId);
  } catch {
    // A full quota can leave an older readable record; prefer this session's latest choice.
    sessionProgress.set(userId, progress);
  }
}

export function armOnboarding(userId: string, storage?: StorageAccess) {
  write(userId, { ...read(userId, storage), pending: true }, storage);
}

export function shouldStartTour(userId: string, stage: TourStage, storage?: StorageAccess) {
  const progress = read(userId, storage);
  return Boolean(progress.pending && !progress[stage]);
}

export function finishTour(userId: string, stage: TourStage, outcome: Outcome, storage?: StorageAccess) {
  const progress = { ...read(userId, storage), [stage]: outcome };
  // Skipping the introduction also opts out of the automatic canvas follow-up.
  if (stage === 'workspace' && outcome === 'skipped') progress.canvas = 'skipped';
  write(userId, progress, storage);
}
