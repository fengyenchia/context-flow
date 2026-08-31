import type { Metadata } from 'next';
import { WorkspaceDashboard } from '@/features/workspaces/workspace-dashboard';
export const metadata: Metadata = { title: '工作區' };
export default function WorkspacesPage() { return <WorkspaceDashboard />; }

