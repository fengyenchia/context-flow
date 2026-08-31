'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { verifyEmail } from '@/lib/api/auth';

export default function VerifyEmailPage() {
  const [message, setMessage] = useState('正在驗證 Email…');
  // Verification is a one-time client request triggered by the email link.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const token = new URLSearchParams(window.location.search).get('token'); if (!token) { setMessage('缺少驗證 token'); return; } verifyEmail(token).then((result) => setMessage(result.message)).catch((reason) => setMessage(reason instanceof Error ? reason.message : '驗證失敗')); }, []);
  return <main className="grid min-h-screen place-items-center bg-background p-6"><div className="w-full max-w-md rounded-primary border border-border bg-surface p-8 text-center shadow-sm"><h1 className="text-xl font-semibold">Email 驗證</h1><p className="mt-3 text-sm text-muted" role="status">{message}</p><Link className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline" href="/login">返回登入</Link></div></main>;
}
