import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: '登入' };
export default function LoginPage() { return <AuthLayout title="登入"><AuthForm mode="login" /></AuthLayout>; }

