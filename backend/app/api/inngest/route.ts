import { serve } from 'inngest/next';
import { canvasBackupCleanup, canvasBackupFlush, dailyCanvasBackupCleanup, documentIndexing, inngest } from '@/server/inngest';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [documentIndexing, canvasBackupFlush, canvasBackupCleanup, dailyCanvasBackupCleanup] });
