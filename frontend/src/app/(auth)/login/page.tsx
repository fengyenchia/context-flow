import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: '登入' };
export default function LoginPage() { return <AuthLayout title="歡迎回來" description="登入後繼續整理你的專案脈絡與團隊共編畫布。"><AuthForm mode="login" /></AuthLayout>; }

