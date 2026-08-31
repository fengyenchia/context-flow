import { ProjectCanvas } from '@/features/projects/project-canvas';

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectCanvas projectId={projectId} />;
}

