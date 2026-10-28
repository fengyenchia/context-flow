import { WebhookHandler } from '@liveblocks/node';
import { captureCanvasBackup, canvasBackupEnabled } from '@/server/canvas-backups';
import { collaborationEnabled } from '@/server/collaboration';
import { state } from '@/server/state';
import { db } from '@/src/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;
  if (!secret || !canvasBackupEnabled() || !collaborationEnabled() || (process.env.NODE_ENV === 'production' && !db)) return Response.json({ message: '備份服務尚未設定' }, { status: 503 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 64 * 1024) return new Response(null, { status: 413 });
  let event;
  try { event = new WebhookHandler(secret).verifyRequest({ headers: request.headers, rawBody }); }
  catch { return Response.json({ message: '簽章驗證失敗' }, { status: 401 }); }
  if (event.type !== 'ydocUpdated') return Response.json({ ok: true });
  const match = /^contextflow:project:([a-zA-Z0-9_-]{1,100})$/.exec(event.data.roomId);
  if (!match) return Response.json({ ok: true });
  const eventId = request.headers.get('webhook-id');
  if (!eventId) return new Response(null, { status: 400 });
  try {
    await state.runRequest(async () => {
      // Removed projects must not be recreated by a delayed notification.
      if (state.projects.has(match[1])) await captureCanvasBackup(match[1], { id: eventId, updatedAt: event.data.updatedAt });
    });
    return Response.json({ ok: true });
  } catch {
    console.error('Canvas backup failed; webhook may retry');
    return Response.json({ message: '備份暫時失敗，請重試' }, { status: 503 });
  }
}
