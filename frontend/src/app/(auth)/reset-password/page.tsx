import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export default function ResetPasswordPage() {
  return <AuthLayout title="重設密碼"><Suspense fallback={<div className="h-48" />}><ResetPasswordForm /></Suspense></AuthLayout>;
}

