import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'context-flow', eventKey: process.env.INNGEST_EVENT_KEY });

export const documentIndexing = inngest.createFunction(
  { id: 'document-indexing-placeholder', retries: 3 },
  { event: 'contextflow/document.uploaded' },
  async ({ event, step }) => step.run('validate-event', () => ({ documentId: event.data.documentId, projectId: event.data.projectId, status: 'queued' })),
);
