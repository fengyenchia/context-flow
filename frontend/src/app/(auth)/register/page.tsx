import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: '建立帳號' };
export default function RegisterPage() { return <AuthLayout title="開始建立工作脈絡" description="設定帳號、Email 與密碼即可開始；驗證連結會寄到你的 Email。AI 功能可稍後加入自己的 Gemini Key。"><AuthForm mode="register" /></AuthLayout>; }

