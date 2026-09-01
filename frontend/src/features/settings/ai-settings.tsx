'use client';

import { IconKey as KeyRound, IconLoader2 as Loader2, IconTrash as Trash2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { deleteGeminiKey, listAiCredentials, saveGeminiKey } from '@/lib/api/settings';
import type { AiCredential } from '@/lib/api/types';
import { Field, SettingsFrame } from './account-settings';

export function AiSettings() {
  const [credential, setCredential] = useState<AiCredential | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { listAiCredentials().then((items) => setCredential(items[0] ?? null)).catch(() => undefined); }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('');
    try { const result = await saveGeminiKey(apiKey); setCredential(result); setApiKey(''); setMessage('API Key 已驗證並加密儲存。'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : '儲存失敗'); }
    finally { setLoading(false); }
  }

  async function remove() { await deleteGeminiKey(); setCredential(null); setMessage('API Key 已刪除。'); }

  return <SettingsFrame title="AI API Key" description="每位使用者使用自己的 Gemini Key；金鑰只會由後端解密，不會傳回瀏覽器。">
    {credential && <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>已連結 Gemini</CardTitle><CardDescription className="mt-1">金鑰提示：{credential.keyHint}</CardDescription></div><Badge>已設定</Badge></div></CardHeader><CardContent><Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="size-4" />刪除金鑰</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5" />{credential ? '更換 API Key' : '新增 Gemini API Key'}</CardTitle><CardDescription>儲存前，後端會向 Gemini 發出最小測試請求確認金鑰有效。</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={save}><Field label="Gemini API Key"><Input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIza…" required /></Field>{message && <p className="text-sm text-muted" role="status">{message}</p>}<Button type="submit" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin" />}{credential ? '驗證並更換' : '驗證並儲存'}</Button></form></CardContent></Card>
  </SettingsFrame>;
}

