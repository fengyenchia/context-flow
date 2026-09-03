import type { CanvasSnapshot, Project } from '@/lib/api/types';
import { toPng } from 'html-to-image';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportProjectMarkdown(project: Project, snapshot: CanvasSnapshot) {
  const lines = [`# ${project.name}`, '', project.description || '', '', '## 節點', ''];
  for (const node of [...snapshot.nodes, ...(snapshot.convergenceNodes || [])]) {
    const data = (node.data || {}) as Record<string, unknown>;
    lines.push(`### ${String(data.nodeTitle || '未命名節點')}`, '', String(data.nodeContent || ''), '');
  }
  if (snapshot.summary) lines.push('## 收斂摘要', '', snapshot.summary, '');
  download(`${project.name || 'context-flow'}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
}

export function exportProjectJson(project: Project, snapshot: CanvasSnapshot) {
  download(`${project.name || 'context-flow'}.json`, JSON.stringify({ project, snapshot }, null, 2), 'application/json;charset=utf-8');
}

export function exportProjectPdf() {
  document.documentElement.classList.add('context-flow-exporting');
  window.setTimeout(() => { window.print(); document.documentElement.classList.remove('context-flow-exporting'); }, 50);
}

export async function exportProjectPng(element: HTMLElement, project: Project) {
  const previous = { height: element.style.height, overflow: element.style.overflow };
  element.classList.add('context-flow-exporting'); element.style.height = 'auto'; element.style.overflow = 'visible';
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  try {
    const width = Math.max(element.scrollWidth, element.getBoundingClientRect().width);
    const height = Math.max(element.scrollHeight, element.getBoundingClientRect().height);
    const dataUrl = await toPng(element, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff', width, height, style: { width: `${width}px`, height: `${height}px`, overflow: 'visible' } });
    const anchor = document.createElement('a'); anchor.download = `${project.name || 'context-flow'}.png`; anchor.href = dataUrl; anchor.click();
  } finally { element.classList.remove('context-flow-exporting'); element.style.height = previous.height; element.style.overflow = previous.overflow; }
}
