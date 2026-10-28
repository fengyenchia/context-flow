import { serve } from 'inngest/next';
import { canvasBackupCleanup, canvasBackupFlush, dailyCanvasBackupCleanup, inngest } from '@/server/inngest';
import { dailyOriginalFileCleanup, originalProjectFileCleanup } from '@/server/file-cleanup-jobs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [canvasBackupFlush, canvasBackupCleanup, dailyCanvasBackupCleanup, originalProjectFileCleanup, dailyOriginalFileCleanup] });
