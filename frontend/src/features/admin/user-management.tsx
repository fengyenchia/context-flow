'use client';

import { IconLoader2 as Loader2, IconRefresh as RefreshCw, IconShieldCheck as ShieldCheck, IconUserCog as UserRoundCog } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listUsers, updateUserRole, updateUserStatus } from '@/lib/api/admin';
import type { AdminUser } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth-store';

export function UserManagement() {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setUsers(await listUsers()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '載入失敗'); }
    finally { setLoading(false); }
  }, []);
  // The first remote hydration deliberately runs once after this screen mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function patchUser(user: AdminUser, kind: 'role' | 'status', value: string) {
    setError('');
    try { if (kind === 'status') await updateUserStatus(user.id, value as AdminUser['status']); else await updateUserRole(user.id, value as AdminUser['role']); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '更新失敗'); }
  }

  if (currentUser?.role !== 'admin') return <div className="p-10"><p className="text-destructive">此頁面僅限管理員使用。</p></div>;

  return <div className="p-5 md:p-10">
    <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight">帳號管理</h1><Button variant="outline" onClick={load}><RefreshCw className="size-4" />重新整理</Button></div>
    {error && <p className="mt-5 rounded-primary bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
    <div className="mt-6 overflow-hidden rounded-primary border bg-surface">
      {loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin" /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b bg-secondary text-xs text-muted"><tr><th className="p-4">使用者</th><th className="p-4">狀態</th><th className="p-4">系統角色</th><th className="p-4">使用量</th><th className="p-4">操作</th></tr></thead><tbody className="divide-y">
        {users.map((user) => <tr key={user.id} className="align-top"><td className="p-4"><p className="font-semibold">{user.displayName}</p><p className="text-xs text-muted">@{user.username}</p></td><td className="p-4"><Badge className={user.status === 'suspended' ? 'text-destructive' : ''}>{user.status}</Badge></td><td className="p-4"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-4" />{user.role}</span></td><td className="p-4 text-xs text-muted">{user.workspaceCount} 工作區<br />{user.projectCount} 專案</td><td className="p-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={user.id === currentUser.id} onClick={() => patchUser(user, 'status', user.status === 'active' ? 'suspended' : 'active')}>{user.status === 'active' ? '停權' : '啟用'}</Button><Button size="sm" variant="outline" onClick={() => patchUser(user, 'role', user.role === 'admin' ? 'user' : 'admin')}><UserRoundCog className="size-4" />{user.role === 'admin' ? '改為一般帳號' : '設為管理員'}</Button></div></td></tr>)}
      </tbody></table></div>}
    </div>
  </div>;
}

