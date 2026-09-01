import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export default function ResetPasswordPage() {
  return <AuthLayout title="重設密碼" description="輸入帳號與註冊 Email 取得重設連結；點擊信件按鈕後即可設定新密碼。"><Suspense fallback={<div className="h-48" />}><ResetPasswordForm /></Suspense></AuthLayout>;
}

