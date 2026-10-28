"use client";

import { useState, type FormEvent } from 'react';
import { IconShare } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { changeProjectLinkRole, createProjectLink, listProjectLinks, revokeProjectLink, type ProjectInviteLink } from '@/lib/api/project-invites';

const selectStyle = 'h-10 rounded-primary border border-border bg-surface px-3 text-sm';
export function ProjectShare({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ProjectInviteLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [revoke, setRevoke] = useState<ProjectInviteLink | null>(null);
  async function load() { setLinks(await listProjectLinks(projectId)); }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : '無法完成操作'); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await run(async () => {
      const link = await createProjectLink(projectId, String(data.get('role')), new Date(Date.now() + Number(data.get('days')) * 86400_000).toISOString());
      setUrl(link.url); await load();
    });
  }
  return <>
    <Button variant="ghost" size="icon" className="icon-tooltip" data-tooltip="分享專案" aria-label="分享專案" onClick={() => { setOpen(true); setRevoke(null); void run(load); }}><IconShare className="size-4" /></Button>
    <Modal open={open} onClose={() => setOpen(false)} dismissible={!busy} title={revoke ? '撤銷邀請連結' : '分享專案'}
      description={revoke ? '收回透過此連結取得的權限；其他連結或工作區原有權限會保留。' : '對方登入後只能存取這個專案，不會加入工作區。'}>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mb-3 text-sm">{message}</p>}
      {revoke ? <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => setRevoke(null)}>返回</Button>
        <Button variant="destructive" disabled={busy} onClick={() => void run(async () => { await revokeProjectLink(projectId, revoke.id); setRevoke(null); setUrl(''); await load(); })}>確定撤銷</Button>
      </div> : <>
        <form onSubmit={create} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">權限<select name="role" className={selectStyle} disabled={busy}><option value="viewer">僅檢視</option><option value="editor">可編輯</option></select></label>
            <label className="flex flex-col gap-1 text-sm">加入期限<select name="days" defaultValue="7" className={selectStyle} disabled={busy}><option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="365">1 年</option></select></label>
          </div>
          <p className="text-sm text-muted">到期後停止新的人加入；已加入的人保留權限，直到撤銷連結。</p>
          <Button type="submit" disabled={busy}>建立邀請連結</Button>
        </form>
        {url && <div className="mt-4 rounded-primary border border-primary/30 bg-primary/5 p-3">
          <label className="mb-2 block text-sm" htmlFor="new-project-invite">新連結只顯示這一次，請先複製保存。</label>
          <div className="flex gap-2"><Input id="new-project-invite" aria-label="邀請連結" readOnly value={url} onFocus={event => event.currentTarget.select()} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage('已複製連結')).catch(() => setError('請選取連結後手動複製'))}>複製</Button></div>
        </div>}
        <div className="mt-6 flex items-center justify-between"><h3 className="text-sm font-semibold">邀請連結</h3><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(load)}>重新整理</Button></div>
        {busy && <p role="status" className="py-3 text-sm text-muted">處理中…</p>}
        {!busy && !links.length && <p className="py-4 text-sm text-muted">尚無邀請連結</p>}
        <ul className="divide-y divide-border">{links.map(link => <li key={link.id} className="space-y-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{new Date(link.createdAt).toLocaleString('zh-TW')} · {link.joinedCount} 人加入</span>
            {link.revokedAt ? <span className="text-sm text-muted">已撤銷</span> : <Button size="sm" variant="outline" disabled={busy} onClick={() => { setRevoke(link); setError(''); setMessage(''); }}>撤銷</Button>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <select aria-label={`連結權限 ${link.id}`} className={selectStyle} value={link.role} disabled={busy || !!link.revokedAt} onChange={event => { const role = event.target.value; void run(async () => { await changeProjectLinkRole(projectId, link.id, role); await load(); }); }}><option value="viewer">僅檢視</option><option value="editor">可編輯</option></select>
            <span>{new Date(link.expiresAt) <= new Date() ? '加入期限已過' : `可加入至 ${new Date(link.expiresAt).toLocaleString('zh-TW')}`}</span>
          </div>
        </li>)}</ul>
        {!!links.length && <p className="mt-2 text-xs text-muted">變更連結權限也會套用到已加入的人。</p>}
      </>}
    </Modal>
  </>;
}
