import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = { title: '重設密碼' };

export default function ResetPasswordPage() {
  return <AuthLayout title="重設密碼"><Suspense fallback={<div className="h-48" />}><ResetPasswordForm /></Suspense></AuthLayout>;
}

