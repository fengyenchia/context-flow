import { Inngest } from 'inngest';
import { env } from '../config/env.js';

export const inngest = new Inngest({ id: 'context-flow', eventKey: env.INNGEST_EVENT_KEY });

export const functions = [
  inngest.createFunction(
    { id: 'document-indexing-placeholder', retries: 3 },
    { event: 'contextflow/document.uploaded' },
    async ({ event, step }) => {
      await step.run('validate-event', () => ({
        documentId: event.data.documentId,
        projectId: event.data.projectId,
        status: 'queued',
      }));
      return { accepted: true };
    },
  ),
];
