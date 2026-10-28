import { Inngest } from 'inngest';
export const inngest = new Inngest({ id: 'context-flow', eventKey: process.env.INNGEST_EVENT_KEY });
