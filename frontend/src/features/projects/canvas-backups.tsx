"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconHistory } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { captureCanvasBackup, listCanvasBackups, restoreCanvasBackup, type CanvasBackup } from '@/lib/api/projects';

export function CanvasBackups({ projectId, synced }: { projectId: string; synced: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState<CanvasBackup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<CanvasBackup | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load(next?: string) {
    setBusy(true); setError('');
    try {
      const result = await listCanvasBackups(projectId, next);
      setBackups(previous => next ? [...previous, ...result.backups] : result.backups);
      setCursor(result.cursor); setLoaded(true);
    } catch (error) { setError(error instanceof Error ? error.message : '無法讀取備份'); }
    finally { setBusy(false); }
  }
  async function capture() {
    setBusy(true); setError(''); setMessage('');
    try { await captureCanvasBackup(projectId); setMessage('已備份雲端畫布'); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : '備份失敗'); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const project = await restoreCanvasBackup(projectId, selected.id);
      router.push(`/workspaces/${project.workspaceId}/projects/${project.id}`);
      setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : '還原失敗'); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="ghost" size="icon" className="icon-tooltip" data-tooltip="畫布備份" aria-label="畫布備份" onClick={() => { setOpen(true); setSelected(null); setMessage(''); void load(); }}>
      <IconHistory className="size-4" />
    </Button>
    <Modal open={open} onClose={() => setOpen(false)} title={selected ? '還原備份' : '畫布備份'} dismissible={!busy}
      description={selected ? '將在同一工作區建立新專案，原畫布保留。' : '自動保存雲端版本；尚未同步的修改不會包含在內。'}>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mb-4 text-sm">{message}</p>}
      {selected ? <>
        <p className="text-sm">備份時間：{new Date(selected.capturedAt).toLocaleString('zh-TW')}</p>
        <p className="mt-2 text-sm text-muted">節點、連線、分色、資料池與對話會一起還原，上傳檔案會從備份複製到新專案。</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>返回</Button>
          <Button disabled={busy} onClick={() => void restore()}>{busy ? '還原中…' : '還原為新專案'}</Button>
        </div>
      </> : <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button disabled={busy || !synced} onClick={() => void capture()}>立即備份</Button>
          <Button variant="outline" disabled={busy} onClick={() => void load()}>重新整理</Button>
          {!synced && <span className="text-xs text-muted">等待畫布同步後可立即備份</span>}
        </div>
        {busy && <p role="status" className="py-3 text-sm text-muted">處理中…</p>}
        {!busy && loaded && !backups.length && <p className="py-6 text-sm text-muted">尚無備份，可先按「立即備份」。</p>}
        <ul className="divide-y divide-border">
          {backups.map(backup => <li key={backup.id} className="flex items-center justify-between gap-3 py-3">
            <time className="text-sm" dateTime={backup.capturedAt}>{new Date(backup.capturedAt).toLocaleString('zh-TW')}</time>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setSelected(backup); setError(''); setMessage(''); }}>還原</Button>
          </li>)}
        </ul>
        {cursor && <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => void load(cursor)}>較早的備份</Button>}
      </>}
    </Modal>
  </>;
}
