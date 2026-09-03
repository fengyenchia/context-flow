'use client';

import { IconEye as Eye, IconEyeOff as EyeOff } from '@tabler/icons-react';
import { useState, type InputHTMLAttributes } from 'react';
import { Input } from './input';

export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? 'text' : 'password'} className={`pr-11${className ? ` ${className}` : ''}`} />
    <button type="button" className="absolute inset-y-0 right-2 grid w-8 place-items-center rounded text-muted hover:text-foreground" onClick={() => setVisible((value) => !value)} aria-label={visible ? '隱藏密碼' : '顯示密碼'}>
      {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
    </button>
  </div>;
}
