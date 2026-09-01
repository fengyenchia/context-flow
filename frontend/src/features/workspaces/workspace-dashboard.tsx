'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { IconArrowRight as ArrowRight, IconFolder as FolderKanban, IconLoader2 as Loader2, IconPlus as Plus, IconUserPlus as UserPlus, IconUsers as Users } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createProject, listProjects } from '@/lib/api/projects';
import { createWorkspace as createWorkspaceApi, inviteWorkspaceMember, listInvitations, listWorkspaces, respondToInvitation } from '@/lib/api/workspaces';
import type { Invitation, Project, Workspace, WorkspaceRole } from '@/lib/api/types';

export function WorkspaceDashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Record<string, Project[]>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);
      const entries = await Promise.all(ws.map(async (workspace) => [workspace.id, await listProjects(workspace.id)] as const));
      setProjects(Object.fromEntries(entries));
      setInvitations(await listInvitations());
    } catch (reason) { setError(reason instanceof Error ? reason.message : '無法讀取工作區'); }
    finally { setLoading(false); }
  }, []);
  // The first remote hydration deliberately runs once after this screen mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await createWorkspaceApi(String(form.get('name')));
    setShowCreate(false); await load();
  }
  async function respond(id: string, action: 'accept' | 'decline') { await respondToInvitation(id, action); await load(); }

  if (loading) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="載入工作區" /></div>;
  return <div className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary">Workspace overview</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">你的工作脈絡</h1><p className="mt-2 text-muted">個人專案與團隊共編都從這裡開始。</p></div><Button onClick={() => setShowCreate((value) => !value)}><Plus className="size-4" />新增共享工作區</Button></header>
    {error && <div className="mt-6 rounded-primary border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error}</div>}
    {invitations.length > 0 && <section className="mt-8 rounded-primary border border-primary/20 bg-primary/10 p-5"><h2 className="font-semibold">待處理邀請</h2><div className="mt-3 space-y-3">{invitations.map((invite) => <div key={invite.id} className="flex flex-col gap-3 rounded-primary bg-surface p-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="font-medium">{invite.workspace.name}</p><p className="text-sm text-muted">邀請角色：{invite.role}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => respond(invite.id, 'accept')}>接受</Button><Button size="sm" variant="outline" onClick={() => respond(invite.id, 'decline')}>略過</Button></div></div>)}</div></section>}
    {showCreate && <Card className="mt-8"><CardHeader><CardTitle>建立共享工作區</CardTitle><CardDescription>建立後可以用帳號名稱邀請成員。</CardDescription></CardHeader><CardContent><form onSubmit={createWorkspace} className="flex flex-col gap-3 sm:flex-row"><label htmlFor="workspace-name" className="sr-only">工作區名稱</label><Input id="workspace-name" name="name" required placeholder="例如：2026 畢製團隊" /><Button type="submit">建立</Button></form></CardContent></Card>}
    <section className="mt-10 space-y-8">{workspaces.map((workspace) => <div key={workspace.id}>
      <div className="mb-4 flex flex-wrap items-center gap-3"><span className="grid size-10 place-items-center rounded-primary bg-secondary"><Users className="size-4 text-primary" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-semibold">{workspace.name}</h2><Badge>{workspace.kind === 'personal' ? '個人' : workspace.role}</Badge></div><p className="text-xs text-muted">{workspace.memberCount} 位成員 · {workspace.projectCount} 個專案</p></div>{workspace.kind === 'shared' && ['owner', 'admin'].includes(workspace.role) && <InviteMember workspaceId={workspace.id} onInvited={load} />}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(projects[workspace.id] ?? []).map((project) => <Link key={project.id} href={`/workspaces/${workspace.id}/projects/${project.id}`} className="group rounded-primary border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg motion-reduce:transform-none"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-primary bg-secondary"><FolderKanban className="size-5 text-primary" /></span><ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></div><h3 className="mt-8 font-semibold">{project.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{project.description || '尚未加入專案說明'}</p></Link>)}{workspace.role !== 'viewer' && <CreateProjectCard workspaceId={workspace.id} onCreated={load} />}</div>
    </div>)}</section>
  </div>;
}

function InviteMember({ workspaceId, onInvited }: { workspaceId: string; onInvited: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await inviteWorkspaceMember(workspaceId, String(form.get('username')), String(form.get('role')) as Exclude<WorkspaceRole, 'owner'>); setMessage('邀請已送出'); setOpen(false); await onInvited(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : '邀請失敗'); }
  }
  if (!open) return <div className="flex items-center gap-2"><span className="text-xs text-muted" role="status">{message}</span><Button size="sm" variant="outline" onClick={() => setOpen(true)}><UserPlus className="size-4" />邀請</Button></div>;
  return <form onSubmit={submit} className="flex w-full flex-wrap gap-2 rounded-primary border bg-surface p-3 md:w-auto"><label htmlFor={`invite-${workspaceId}`} className="sr-only">受邀帳號</label><Input id={`invite-${workspaceId}`} name="username" className="w-40" placeholder="使用者帳號" required /><label htmlFor={`role-${workspaceId}`} className="sr-only">角色</label><select id={`role-${workspaceId}`} name="role" className="min-h-10 rounded-primary border bg-transparent px-3 text-sm"><option value="editor">可編輯</option><option value="viewer">僅檢視</option><option value="admin">工作區管理員</option></select><Button size="sm" type="submit">送出</Button><Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button></form>;
}

function CreateProjectCard({ workspaceId, onCreated }: { workspaceId: string; onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await createProject(workspaceId, { name: String(form.get('name')), description: String(form.get('description') ?? ''), layoutDirection: 'LR' }); setOpen(false); await onCreated(); }
  if (!open) return <button onClick={() => setOpen(true)} className="min-h-48 rounded-primary border border-dashed p-5 text-left text-sm font-medium text-muted hover:border-primary hover:bg-surface"><Plus className="mb-8 size-5" />新增專案</button>;
  return <Card><CardContent className="pt-5"><form onSubmit={submit} className="space-y-3"><label className="text-sm font-medium" htmlFor={`project-${workspaceId}`}>專案名稱</label><Input id={`project-${workspaceId}`} name="name" required autoFocus /><label className="text-sm font-medium" htmlFor={`description-${workspaceId}`}>說明</label><Input id={`description-${workspaceId}`} name="description" /><div className="flex gap-2"><Button size="sm" type="submit">建立</Button><Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>取消</Button></div></form></CardContent></Card>;
}


