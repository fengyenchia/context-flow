import { serve } from 'inngest/next';
import { documentIndexing, inngest } from '@/server/inngest';

export const { GET, POST, PUT } = serve({ client: inngest, functions: [documentIndexing] });
