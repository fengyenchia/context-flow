import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/site-metadata';
import { ProjectInvitePage } from '@/features/projects/project-invite-page';

export const metadata: Metadata = { ...privateMetadata, title: '專案邀請', referrer: 'no-referrer' };
export default function Page() { return <ProjectInvitePage />; }
