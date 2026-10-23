import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: '建立帳號' };
export default function RegisterPage() { return <AuthLayout title="註冊" description="註冊後請至信箱完成驗證。"><AuthForm mode="register" /></AuthLayout>; }

