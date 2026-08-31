import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export default function ResetPasswordPage() {
  return <AuthLayout title="重設密碼" description="用 Email 取得連結，或輸入管理員提供的 30 分鐘一次性重設碼。"><Suspense fallback={<div className="h-48" />}><ResetPasswordForm /></Suspense></AuthLayout>;
}

