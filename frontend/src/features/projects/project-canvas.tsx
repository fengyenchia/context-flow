'use client';

import { useGSAP } from '@gsap/react';
import { Background, Controls, MiniMap, Position, ReactFlow, addEdge, type Connection, type Edge, type Node, useEdgesState, useNodesState } from '@xyflow/react';
import gsap from 'gsap';
import { IconArrowLeft as ArrowLeft, IconRobot as Bot, IconCopy as Copy, IconFileText as FileText, IconPhoto as Image, IconLink as Link2, IconLoader2 as Loader2, IconMessageCircle as MessageCircle, IconLayoutSidebarLeftCollapse as PanelLeftClose, IconLayoutSidebarLeftExpand as PanelLeftOpen, IconLayoutSidebarRightCollapse as PanelRightClose, IconPlus as Plus, IconRefresh as RefreshCw, IconSend as Send, IconSparkles as Sparkles, IconNote as StickyNote, IconUpload as Upload, IconX as X, IconColumns3 as LayoutGrid } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { askProjectAssistant, generateDataZone, getProject } from '@/lib/api/projects';
import { useAuthStore } from '@/stores/auth-store';
import { useVerticalSplit } from './resizable-left-panel';
import type { DataResource, DataResourceKind, DataZoneStructure, Project } from '@/lib/api/types';

gsap.registerPlugin(useGSAP);
type Area = 'pool' | 'zone' | 'diverge' | 'converge';
type CanvasNodeKind = 'text' | 'note' | 'link' | 'image';
type CanvasNodeEvent = {
  area: 'zone' | 'diverge' | 'converge';
  kind: CanvasNodeKind;
  title: string;
  content: string;
  imageUrl?: string;
};
type CanvasNodeEditEvent = Pick<CanvasNodeEvent, 'kind' | 'title' | 'content' | 'imageUrl'> & { id: string };
type CanvasNodeUpdateEvent = CanvasNodeEditEvent & { color: string };
type CanvasNodeDialogEvent = CanvasNodeEvent & { mode: 'create' };
type PreviewDraft = { id: string; title: string; content: string; kind?: 'core' | 'reference' | 'insight'; color?: string; parentId?: string };
type NodePreview = { area: 'zone' | 'diverge'; drafts: PreviewDraft[]; relations: { source: string; target: string; label?: string }[]; resourceIds?: string[] };
type EdgeEditEvent = { id: string; label: string };
const nodeStyle = (kind: 'core' | 'reference' | 'insight' | 'diverge' | 'converge') => ({ width: 220, borderRadius: 'var(--radius-primary)', border: '1px solid var(--border)', background: kind === 'core' ? 'var(--node-context)' : kind === 'converge' ? 'var(--node-outcome)' : kind === 'diverge' || kind === 'insight' ? 'var(--node-idea)' : 'var(--node-reference)', color: 'var(--foreground)', padding: 14, fontSize: 13 });
function structureToFlow(structure: DataZoneStructure) { const ids = new Map(structure.nodes.map((node) => [node.id, `ai-${crypto.randomUUID()}`])); return { nodes: structure.nodes.map((node, index) => { const id = ids.get(node.id)!; return { id, position: { x: 80 + (index % 3) * 270, y: 70 + Math.floor(index / 3) * 160 }, data: { label: canvasNodeLabel(id, 'text', node.label, node.description), nodeKind: 'text', nodeTitle: node.label, nodeContent: node.description, nodeColor: node.kind === 'insight' ? 'var(--node-idea)' : node.kind === 'reference' ? 'var(--node-reference)' : 'var(--node-context)', aiGenerated: true }, style: nodeStyle(node.kind) }; }), edges: structure.edges.flatMap((edge, index) => { const source = ids.get(edge.source); const target = ids.get(edge.target); return source && target ? [{ id: `ai-edge-${crypto.randomUUID()}-${index}`, source, target, label: edge.label, type: 'bezier', style: { stroke: 'var(--primary)' }, labelStyle: { fill: 'var(--muted)', fontSize: 11 } }] : []; }) }; }
const AUTO_LAYOUT_COLUMN_GAP = 340;
const AUTO_LAYOUT_ROW_GAP = 280;
function layoutGraph(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((node) => node.id)); const children = new Map<string, string[]>(); const parents = new Map<string, string[]>(); const incoming = new Map<string, number>(); const rank = new Map<string, number>();
  nodes.forEach((node) => { children.set(node.id, []); parents.set(node.id, []); incoming.set(node.id, 0); rank.set(node.id, 0); });
  edges.forEach((edge) => { if (!ids.has(edge.source) || !ids.has(edge.target)) return; children.get(edge.source)?.push(edge.target); parents.get(edge.target)?.push(edge.source); incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1); });
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id); const visited = new Set<string>();
  while (queue.length) { const id = queue.shift()!; visited.add(id); children.get(id)?.forEach((child) => { rank.set(child, Math.max(rank.get(child) || 0, (rank.get(id) || 0) + 1)); incoming.set(child, (incoming.get(child) || 1) - 1); if (incoming.get(child) === 0) queue.push(child); }); }
  nodes.filter((node) => !visited.has(node.id)).forEach((node, index) => rank.set(node.id, index + 1));
  const columns = new Map<number, Node[]>(); nodes.forEach((node) => { const depth = rank.get(node.id) || 0; columns.set(depth, [...(columns.get(depth) || []), node]); });
  const maxDepth = Math.max(...Array.from(columns.keys()));
  const reorder = (depth: number, related: Map<string, string[]>, relatedDepth: number) => {
    const layer = columns.get(depth) || []; const nearby = columns.get(relatedDepth) || []; const nearbyOrder = new Map(nearby.map((node, index) => [node.id, index]));
    const score = (node: Node) => { const positions = (related.get(node.id) || []).filter((id) => rank.get(id) === relatedDepth).map((id) => nearbyOrder.get(id)).filter((index): index is number => index !== undefined); return positions.length ? positions.reduce((sum, index) => sum + index, 0) / positions.length : Number.MAX_SAFE_INTEGER; };
    columns.set(depth, [...layer].sort((left, right) => score(left) - score(right)));
  };
  for (let pass = 0; pass < 3; pass += 1) { for (let depth = 1; depth <= maxDepth; depth += 1) reorder(depth, parents, depth - 1); for (let depth = maxDepth - 1; depth >= 0; depth -= 1) reorder(depth, children, depth + 1); }
  return nodes.map((node) => { const depth = rank.get(node.id) || 0; const siblings = columns.get(depth) || []; return { ...node, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: { x: 80 + siblings.findIndex((item) => item.id === node.id) * AUTO_LAYOUT_COLUMN_GAP, y: 80 + depth * AUTO_LAYOUT_ROW_GAP } }; });
}
function canvasNodeLabel(id: string, kind: CanvasNodeKind, title: string, content: string, imageUrl?: string) {
  const Icon = kind === 'note' ? StickyNote : kind === 'link' ? Link2 : kind === 'image' ? Image : FileText;
  const safeLink = /^https?:\/\//i.test(content) ? content : undefined;
  return <div onDoubleClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent<CanvasNodeEditEvent>('context-flow:edit-node', { detail: { id, kind, title, content, imageUrl } })); }} title="雙擊編輯"><div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium opacity-65"><Icon className="size-3.5" />{kind === 'note' ? '便條' : kind === 'link' ? '連結' : kind === 'image' ? '圖片' : '文字'}</div><p className="font-semibold">{title}</p>{kind === 'image' && imageUrl ? <img className="mt-2 max-h-32 w-full rounded object-cover" src={imageUrl} alt={title} /> : kind === 'link' && safeLink ? <a className="mt-1 block truncate text-xs leading-5 text-primary underline underline-offset-2" href={safeLink} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{content}</a> : <p className="mt-1 text-xs leading-5 opacity-70">{content}</p>}</div>;
}
function MarkdownMessage({ text }: { text: string }) {
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
  return <div className="space-y-2">{text.split(/\r?\n/).map((line, index) => { const trimmed = line.trim(); if (!trimmed) return <div key={index} className="h-1" />; if (trimmed.startsWith('### ')) return <h4 key={index} className="font-semibold">{inline(trimmed.slice(4))}</h4>; if (trimmed.startsWith('## ')) return <h3 key={index} className="text-sm font-semibold">{inline(trimmed.slice(3))}</h3>; if (trimmed.startsWith('# ')) return <h2 key={index} className="text-base font-semibold">{inline(trimmed.slice(2))}</h2>; if (/^[-*]\s+/.test(trimmed)) return <li key={index} className="ml-4 list-disc">{inline(trimmed.replace(/^[-*]\s+/, ''))}</li>; if (/^\d+\.\s+/.test(trimmed)) return <li key={index} className="ml-4 list-decimal">{inline(trimmed.replace(/^\d+\.\s+/, ''))}</li>; return <p key={index}>{inline(trimmed)}</p>; })}</div>;
}
function NodePreviewPanel({ preview, onChange, onCancel, onCommit }: { preview: NodePreview; onChange: (drafts: PreviewDraft[]) => void; onCancel: () => void; onCommit: () => void }) {
  const areaName = preview.area === 'zone' ? '資料架構區' : '發散思考區';
  return <section className="mt-3 rounded-primary border border-primary/30 bg-primary/5 p-3" aria-label={`${areaName}節點預覽`}><div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">節點預覽</p><p className="text-xs text-muted">逐筆修改後再加入畫布</p></div><Button type="button" variant="ghost" size="icon" className="size-7" onClick={onCancel} aria-label="取消預覽"><X className="size-4" /></Button></div><div className="max-h-72 space-y-3 overflow-y-auto pr-1">{preview.drafts.map((draft, index) => <div key={draft.id} className="rounded-primary border border-border bg-surface p-3"><div className="mb-2 flex items-center justify-between text-xs text-muted"><span>節點 {index + 1}</span><button type="button" className="text-primary hover:underline" onClick={() => onChange(preview.drafts.filter((item) => item.id !== draft.id))}>移除</button></div><Input value={draft.title} onChange={(event) => onChange(preview.drafts.map((item) => item.id === draft.id ? { ...item, title: event.target.value } : item))} placeholder="節點標題" /><textarea value={draft.content} onChange={(event) => onChange(preview.drafts.map((item) => item.id === draft.id ? { ...item, content: event.target.value } : item))} className="mt-2 min-h-24 w-full resize-y rounded-primary border border-border bg-background p-2 text-sm outline-none focus:border-primary" placeholder="節點內容" /></div>)}</div><div className="mt-3 flex items-center justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消</Button><Button type="button" size="sm" onClick={onCommit} disabled={!preview.drafts.length}><Plus className="size-3.5" />加入節點至{areaName}</Button></div></section>;
}
function assistantToPreview(content: string) {
  let currentParent: string | undefined;
  let previousId: string | undefined;
  let pendingHeading = '';
  const relations: NodePreview['relations'] = [];
  const lines = content.split(/\r?\n/).flatMap((value) => { const line = value.trim(); if (!line || /^---+$/.test(line)) return []; if (/^#{1,4}\s+/.test(line) || /^[-*•]\s+|^\d+[.)、]\s+/.test(line)) return [line]; return line.length > 180 ? line.split(/(?<=[。！？!?；;])\s*/).filter(Boolean) : [line]; });
  const drafts: PreviewDraft[] = [];
  lines.forEach((line) => {
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) { pendingHeading = heading[1].trim(); return; }
    const cleaned = line.replace(/^[-*•]\s+|^\d+[.)、]\s+/, '').trim();
    if (!cleaned) return;
    const labelled = cleaned.match(/^([^：:]{1,18})[：:](.+)$/);
    const id = `preview-${crypto.randomUUID()}`;
    const title = pendingHeading || labelled?.[1]?.trim() || `重點 ${drafts.length + 1}`;
    const draft: PreviewDraft = { id, title, content: (pendingHeading || labelled) ? (labelled?.[2]?.trim() || cleaned) : cleaned };
    drafts.push(draft);
    if (currentParent) relations.push({ source: currentParent, target: id, label: '展開' }); else if (previousId) relations.push({ source: previousId, target: id, label: '相關' });
    if (pendingHeading) currentParent = id;
    pendingHeading = '';
    previousId = id;
  });
  return { drafts, relations };
}
function colorsByPath(drafts: PreviewDraft[], relations: NodePreview['relations']) {
  const palette = ['var(--node-context)', 'var(--node-reference)', 'var(--node-idea)', 'var(--node-outcome)'];
  const inbound = new Map<string, string>(); relations.forEach((relation) => inbound.set(relation.target, relation.source));
  const colors = new Map<string, string>(); let rootIndex = 0;
  const colorFor = (id: string): string => { const parent = inbound.get(id); if (parent) return colors.get(parent) || colorFor(parent); const next = palette[rootIndex % palette.length]; rootIndex += 1; return next; };
  drafts.forEach((draft) => colors.set(draft.id, draft.color || colorFor(draft.id)));
  return colors;
}
function ChatActionBar({ content: _content, onRegenerate, onCopy, onCreateNodes }: { content: string; onRegenerate: () => void; onCopy: () => void; onCreateNodes: () => void }) {
  return <div className="chat-message-actions mt-2 flex items-center gap-1 text-[11px] text-muted"><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary" onClick={onRegenerate}><RefreshCw className="size-3" />重做</button><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary" onClick={onCopy}><Copy className="size-3" />複製</button><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-primary hover:bg-primary/10" onClick={onCreateNodes}><Plus className="size-3" />產生節點</button></div>;
}

export function ProjectCanvas({ projectId }: { projectId: string }) {
  const router = useRouter(); const root = useRef<HTMLDivElement>(null); const { containerRef: leftPanelRef, topPercent, beginDrag } = useVerticalSplit(); const [project, setProject] = useState<Project | null>(null); const [resources, setResources] = useState<DataResource[]>([]); const [processedResourceIds, setProcessedResourceIds] = useState<string[]>([]); const [structure, setStructure] = useState<DataZoneStructure | null>(null); const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]); const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]); const [collapsed, setCollapsed] = useState<Record<Area, boolean>>({ pool: false, zone: false, diverge: false, converge: false }); const [layout, setLayout] = useState<'row' | 'column'>('row'); const [selectedNode, setSelectedNode] = useState<string>(); const [prompt, setPrompt] = useState(''); const [answer, setAnswer] = useState(''); const [messages, setMessages] = useState<{role: 'user' | 'assistant'; content: string}[]>([]); const [summary, setSummary] = useState(''); const [nodePreview, setNodePreview] = useState<NodePreview | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const conversationMessages = useRef<Record<string, { role: 'user' | 'assistant'; content: string }[]>>({ general: [] });
  const conversationHistory = useRef<Record<string, string[]>>({ general: [] });
  const lastDivergenceNode = useRef<string>();
  const activeConversation = useRef('general');
  const currentUser = useAuthStore((state) => state.user);
  useEffect(() => {
    const addCanvasNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEvent>).detail;
      if (!detail) return;
      if (detail.area === 'converge') return;
      const id = `${detail.area}-${crypto.randomUUID()}`;
      setNodes((current) => {
        const inArea = current.filter((node) => String(node.id).startsWith(`${detail.area}-`)).length;
        return [...current, {
          id,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          position: { x: 70 + (inArea % 3) * 255, y: 70 + Math.floor(inArea / 3) * 180 },
          data: { label: canvasNodeLabel(id, detail.kind, detail.title, detail.content, detail.imageUrl), content: detail.content, nodeKind: detail.kind, nodeTitle: detail.title, nodeContent: detail.content, imageUrl: detail.imageUrl, nodeColor: detail.area === 'diverge' ? 'var(--node-idea)' : detail.area === 'converge' ? 'var(--node-outcome)' : 'var(--node-context)' },
          style: nodeStyle(detail.area === 'diverge' ? 'diverge' : detail.area === 'converge' ? 'converge' : detail.kind === 'note' ? 'insight' : detail.kind === 'link' ? 'reference' : 'core'),
        }];
      });
      setSelectedNode(id);
    };
    const updateCanvasNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeUpdateEvent>).detail;
      if (!detail) return;
      setNodes((current) => current.map((node) => {
        const data = node.data as Record<string, unknown>;
        if (node.id !== detail.id) return node;
        return { ...node, data: { ...data, label: canvasNodeLabel(node.id, detail.kind, detail.title, detail.content, detail.imageUrl), nodeKind: detail.kind, nodeTitle: detail.title, nodeContent: detail.content, imageUrl: detail.imageUrl, nodeColor: detail.color }, style: { ...node.style, background: detail.color } };
      }));
    };
    window.addEventListener('context-flow:add-node', addCanvasNode);
    window.addEventListener('context-flow:update-node', updateCanvasNode);
    return () => { window.removeEventListener('context-flow:add-node', addCanvasNode); window.removeEventListener('context-flow:update-node', updateCanvasNode); };
  }, [nodes, setNodes]);
  useEffect(() => { const updateEdge = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (!detail || detail.id.startsWith('converge-')) return; setEdges((current) => current.map((edge) => edge.id === detail.id ? { ...edge, label: detail.label } : edge)); }; window.addEventListener('context-flow:update-edge', updateEdge); return () => window.removeEventListener('context-flow:update-edge', updateEdge); }, [setEdges]);
  useEffect(() => { const editEdgeLabel = (event: MouseEvent) => { const target = event.target; if (!(target instanceof Element)) return; const label = target.closest('.react-flow__edge-text, .react-flow__edge-textwrapper'); const edge = label?.closest('.react-flow__edge') || label?.closest('[data-id]'); const id = edge?.getAttribute('data-id'); if (!id) return; const current = label?.textContent?.trim() || ''; const next = window.prompt('編輯連線關係', current); if (next === null) return; event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent<EdgeEditEvent>('context-flow:update-edge', { detail: { id, label: next.trim() || '相關' } })); }; const element = root.current; element?.addEventListener('dblclick', editEdgeLabel, true); return () => element?.removeEventListener('dblclick', editEdgeLabel, true); }, []);
  useEffect(() => {
    const removeSelectedItems = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const selectedEdgeIds = Array.from(root.current?.querySelectorAll<SVGGElement>('.react-flow__edge.selected') || []).map((edge) => edge.dataset.id).filter((id): id is string => Boolean(id));
      const selectedNodeIds = Array.from(root.current?.querySelectorAll<HTMLElement>('.react-flow__node.selected') || []).map((node) => node.dataset.id).filter((id): id is string => Boolean(id));
      if (!selectedEdgeIds.length && !selectedNodeIds.length) return;
      event.preventDefault();
      if (selectedNodeIds.length) setNodes((current) => current.filter((node) => !selectedNodeIds.includes(node.id)));
      setEdges((current) => current.filter((edge) => !selectedEdgeIds.includes(edge.id) && !selectedNodeIds.includes(edge.source) && !selectedNodeIds.includes(edge.target)));
    };
    window.addEventListener('keydown', removeSelectedItems);
    return () => window.removeEventListener('keydown', removeSelectedItems);
  }, [setEdges, setNodes]);
  useEffect(() => {
    if (!edges.length) return;
    setNodes((current) => layoutGraph(current, edges));
  }, [edges.length, setNodes]);
  useEffect(() => {
    const submitOnEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains('max-h-28')) return;
      const form = target.closest('form');
      if (!form) return;
      event.preventDefault();
      form.requestSubmit();
    };
    window.addEventListener('keydown', submitOnEnter);
    return () => window.removeEventListener('keydown', submitOnEnter);
  }, []);
  useEffect(() => {
    const editUserMessage = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const bubble = target.closest('.ml-10');
      if (!bubble) return;
      const text = bubble.textContent?.replace(currentUser?.username || '你', '').trim();
      if (!text) return;
      setPrompt(text);
      window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea.max-h-28')?.focus(), 0);
    };
    const rootElement = root.current;
    rootElement?.addEventListener('dblclick', editUserMessage);
    return () => rootElement?.removeEventListener('dblclick', editUserMessage);
  }, [currentUser?.username]);
  useGSAP(() => { gsap.fromTo('.workspace-area', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: .3, stagger: .05, ease: 'power2.out' }); }, { scope: root, dependencies: [collapsed.pool, collapsed.zone, collapsed.diverge, collapsed.converge, layout], revertOnUpdate: true });
  useEffect(() => { const nextConversation = selectedNode?.startsWith('diverge-') ? selectedNode : 'general'; if (activeConversation.current === nextConversation) return; conversationMessages.current[activeConversation.current] = messages; activeConversation.current = nextConversation; setMessages(conversationMessages.current[nextConversation] || []); }, [selectedNode]);
  useEffect(() => { getProject(projectId).then(setProject).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [projectId]);
  useEffect(() => { if (!error) return; const timer = window.setTimeout(() => setError(''), 3500); return () => window.clearTimeout(timer); }, [error]);
  useEffect(() => { if (!summary) setSummary('\u200b'); }, [summary]);
  useEffect(() => {
    if (!summary || summary === '\u200b') return;
    window.dispatchEvent(new CustomEvent('context-flow:add-convergence-result', { detail: { content: summary } }));
    setSummary('\u200b');
  }, [summary]);
  const canEdit = project?.role !== 'viewer'; const toggle = (area: Area) => setCollapsed((current) => ({ ...current, [area]: !current[area] })); const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, type: 'bezier', style: { stroke: 'var(--primary)' } }, current)), [setEdges]);
  function addResource(resource: DataResource) { if (resource.contentHash && resources.some((item) => item.contentHash === resource.contentHash)) { setError('此檔案內容已在資料池中，未重複加入。'); return; } setResources((current) => [...current, resource]); }
  async function createStructure() { const pending = resources.filter((resource) => !processedResourceIds.includes(resource.id)); if (!pending.length) return; setBusy(true); setError(''); try { const result = await generateDataZone(projectId, pending); setNodePreview({ area: 'zone', drafts: result.nodes.map((node) => ({ id: node.id, title: node.label, content: node.description, kind: node.kind })), relations: result.edges, resourceIds: pending.map((resource) => resource.id) }); } catch (reason) { setError(reason instanceof Error ? reason.message : '建立資料架構失敗'); } finally { setBusy(false); } }
  async function askAssistant(event: React.FormEvent) { event.preventDefault(); const question = prompt.trim(); if (!question) return; const conversationId = selectedNode?.startsWith('diverge-') ? selectedNode : 'general'; const activeNode = conversationId === 'general' ? undefined : nodes.find((node) => node.id === conversationId); const resourceContext = resources.length ? `資料池內容（請優先參考）：\n${resources.map((resource) => `- ${resource.title}: ${resource.content || resource.url || ''}`).join('\n').slice(0, 7000)}` : '資料池目前沒有內容，請以一般知識協助思考。'; const nodeContext = activeNode ? `目前延伸的節點：${String(activeNode.data.nodeTitle || '')}\n${String(activeNode.data.nodeContent || '')}` : '目前是發散思考的共用對話。'; const history = conversationHistory.current[conversationId] || []; setBusy(true); setError(''); try { const result = await askProjectAssistant(projectId, [nodeContext, resourceContext, ...history.slice(-6), `使用者：${question}`].join('\n\n')); const regenerate = () => { setPrompt(question); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea.max-h-28')?.closest('form')?.requestSubmit(), 0); }; const copy = () => { void navigator.clipboard?.writeText(result.content); setError('AI 回覆已複製'); }; const assistantContent = <div className="chat-message-shell"><div className="chat-message-role">AI</div><div className="chat-message-bubble"><MarkdownMessage text={result.content} /></div><ChatActionBar content={result.content} onRegenerate={regenerate} onCopy={copy} onCreateNodes={() => addAnswerToDivergence(result.content, conversationId === 'general' ? undefined : conversationId)} /></div> as unknown as string; const userContent = <div className="chat-message-shell chat-message-user"><div className="chat-message-role">{currentUser?.username || '你'}</div><div className="chat-message-bubble"><p>{question}</p></div></div> as unknown as string; const nextMessages = [...messages, { role: 'user' as const, content: userContent }, { role: 'assistant' as const, content: assistantContent }]; conversationMessages.current[conversationId] = nextMessages; conversationHistory.current[conversationId] = [...history, `使用者：${question}`, `AI：${result.content}`]; setAnswer(result.content); setMessages(nextMessages); setPrompt(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI 請求失敗'); } finally { setBusy(false); } }
  function addAnswerToDivergence(content: string, parent?: string) { if (!content) return; const preview = assistantToPreview(content); const source = parent || lastDivergenceNode.current; if (source && preview.drafts[0]) preview.relations.unshift({ source, target: preview.drafts[0].id, label: parent ? '延伸' : '同一對話' }); setNodePreview({ area: 'diverge', ...preview }); }
  function commitPreview() { if (!nodePreview?.drafts.length) return; const colors = colorsByPath(nodePreview.drafts, nodePreview.relations); const ids = new Map(nodePreview.drafts.map((draft) => [draft.id, `${nodePreview.area === 'zone' ? 'ai' : 'diverge'}-${crypto.randomUUID()}`])); const created = nodePreview.drafts.map((draft, index) => { const id = ids.get(draft.id)!; const color = colors.get(draft.id) || 'var(--node-context)'; return { id, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: { x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP, y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP }, data: { label: canvasNodeLabel(id, 'text', draft.title || '未命名節點', draft.content), nodeKind: 'text', nodeTitle: draft.title || '未命名節點', nodeContent: draft.content, nodeColor: color, aiGenerated: true }, style: { ...nodeStyle(nodePreview.area === 'diverge' ? 'diverge' : draft.kind === 'reference' ? 'reference' : draft.kind === 'insight' ? 'insight' : 'core'), background: color } }; }); const createdEdges = nodePreview.relations.flatMap((relation) => { const source = ids.get(relation.source) || (relation.source.startsWith('diverge-') ? relation.source : undefined); const target = ids.get(relation.target); return source && target ? [{ id: `edge-${crypto.randomUUID()}`, source, target, label: relation.label || '相關', type: 'bezier' as const, style: { stroke: 'var(--primary)' }, labelStyle: { fill: 'var(--muted)', fontSize: 11 } }] : []; }); setNodes((current) => [...current, ...layoutGraph(created, createdEdges)]); setEdges((current) => [...current, ...createdEdges]); if (nodePreview.area === 'zone') { setProcessedResourceIds((current) => [...current, ...(nodePreview.resourceIds || [])]); } else { lastDivergenceNode.current = created[created.length - 1].id; } setNodePreview(null); }
  function autoLayout(event?: React.MouseEvent<HTMLButtonElement>) { const section = event?.currentTarget.closest('.workspace-area'); const areaIndex = section ? Array.from(root.current?.querySelectorAll('.workspace-area') || []).indexOf(section) : -1; const area = areaIndex === 1 ? 'zone' : areaIndex === 2 ? 'diverge' : areaIndex === 3 ? 'converge' : undefined; if (!area) return; if (area === 'converge') { window.dispatchEvent(new Event('context-flow:layout-converge')); return; } const prefix = `${area}-`; const scopedNodes = nodes.filter((node) => String(node.id).startsWith(prefix) || (area === 'zone' && String(node.id).startsWith('ai-'))); const scopedIds = new Set(scopedNodes.map((node) => node.id)); const scopedEdges = edges.filter((edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target)); setNodes((current) => [...current.filter((node) => !scopedIds.has(node.id)), ...layoutGraph(scopedNodes, scopedEdges)]); }
  async function converge() { setBusy(true); setError(''); try { const context = [...resources.map((item) => `${item.title}: ${item.content || item.url || ''}`), ...nodes.map((node) => String(node.data.label))].join('\n'); const result = await askProjectAssistant(projectId, `請將以下資料架構與發散思考收斂成清楚的結論、決策與下一步：\n${context}`); setSummary(result.content); setCollapsed((current) => ({ ...current, converge: false })); } catch (reason) { setError(reason instanceof Error ? reason.message : '無法產生總結'); } finally { setBusy(false); } }
  if (loading) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>; if (!project) return <div className="p-8 text-destructive">{error || '找不到專案'}</div>;
  return <div ref={root} className="flex h-screen min-h-[44rem] flex-col bg-background"><header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4"><Button variant="ghost" size="icon" onClick={() => router.push('/workspaces')} aria-label="返回工作區"><ArrowLeft className="size-5" /></Button><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold">{project.name}</h1><p className="truncate text-xs text-muted">{project.description || '專案工作區'}</p></div><Badge>{project.role}</Badge><div className="flex items-center gap-1 rounded-primary border border-border p-1"><Button size="sm" variant={layout === 'row' ? 'default' : 'ghost'} onClick={() => setLayout('row')} aria-label="橫式布局"><LayoutGrid className="size-4" /></Button><Button size="sm" variant={layout === 'column' ? 'default' : 'ghost'} onClick={() => setLayout('column')} aria-label="直式布局"><span className="text-xs">↕</span></Button></div></header>{error && <div className="fixed bottom-5 right-5 z-50 max-w-xs rounded-primary border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-foreground shadow-md backdrop-blur-sm" role="alert"><span className="mr-2 inline-block size-2 rounded-full bg-primary align-middle" />{error}</div>}<div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden bg-border lg:flex-row">
    <section className={`workspace-area flex min-h-0 flex-col bg-surface ${collapsed.pool ? 'lg:w-20 lg:flex-none' : 'lg:w-[22rem] lg:shrink-0'}`}><AreaHeader title="資料池與 AI 助理" subtitle="Data Pool · Assistant" icon={<Bot className="size-4" />} collapsed={collapsed.pool} onToggle={() => toggle('pool')} left />{!collapsed.pool && <div ref={leftPanelRef} className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 overflow-y-auto p-3" style={{ height: `${topPercent}%` }}><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-primary bg-primary/20 text-primary"><FileText className="size-3.5" /></span><span>資料池</span><span className="text-xs font-normal text-muted">Data Pool</span></div><ResourceComposer onAdd={addResource} /><div className="mt-3 space-y-2">{resources.map((resource) => <ResourceItem key={resource.id} resource={resource} onRemove={() => setResources((current) => current.filter((item) => item.id !== resource.id))} />)}</div>{nodePreview?.area === 'zone' && <NodePreviewPanel preview={nodePreview} onChange={(drafts) => setNodePreview({ ...nodePreview, drafts })} onCancel={() => setNodePreview(null)} onCommit={commitPreview} />}<Button onClick={createStructure} disabled={!canEdit || !resources.length || busy} className="mt-3 w-full"><Sparkles className="size-4" />建立資料架構</Button></div><button type="button" onPointerDown={beginDrag} className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center bg-surface" aria-label="拖曳調整資料池與 AI 助理高度"><span className="h-1 w-12 rounded-full bg-border group-hover:bg-primary" /></button><div className="flex min-h-0 flex-1 flex-col border-t border-border bg-background"><div className="mb-3 flex items-center gap-2 px-3 pt-3 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-primary bg-primary/20 text-primary"><MessageCircle className="size-3.5" /></span><span>思考夥伴</span><span className="text-xs font-normal text-muted">AI Partner</span></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">{messages.length === 0 ? <div className="mx-auto mt-8 max-w-[15rem] rounded-primary border border-primary/20 bg-primary/10 p-4 text-center"><Sparkles className="mx-auto size-5 text-primary" /><p className="mt-2 text-sm font-semibold text-foreground">讓想法沿著脈絡前進</p><p className="mt-2 text-xs leading-5 text-muted">問我資料缺口、矛盾，或下一步該驗證什麼。</p></div> : messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-10 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-surface' : 'mr-8 rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-sm leading-6'}>{message.content}</div>)}{nodePreview?.area === 'diverge' && <NodePreviewPanel preview={nodePreview} onChange={(drafts) => setNodePreview({ ...nodePreview, drafts })} onCancel={() => setNodePreview(null)} onCommit={commitPreview} />}</div><form onSubmit={askAssistant} className="border-t border-primary/15 bg-surface/95 p-3"><div className="flex items-end gap-2 rounded-primary border border-primary/20 bg-primary/5 p-2 focus-within:ring-2 focus-within:ring-primary/20"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" placeholder={selectedNode ? '針對這個節點延伸思考…' : '例如：這裡有哪些假設需要驗證？'} /><Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={busy || !prompt.trim()}><Send className="size-4" /></Button></div></form></div></div>}</section>
    <div className="grid min-h-0 min-w-0 flex-1 gap-px bg-border" style={{ gridTemplateColumns: layout === 'row' ? `minmax(0, ${collapsed.zone ? '5rem' : '1fr'}) minmax(0, ${collapsed.diverge ? '5rem' : '1fr'}) minmax(0, ${collapsed.converge ? '5rem' : '1fr'})` : undefined, gridTemplateRows: layout === 'column' ? `minmax(0, ${collapsed.zone ? '5rem' : '1fr'}) minmax(0, ${collapsed.diverge ? '5rem' : '1fr'}) minmax(0, ${collapsed.converge ? '5rem' : '1fr'})` : undefined }}><CanvasArea title="資料架構區" subtitle="Data Zone" icon={<Sparkles className="size-4" />} collapsed={collapsed.zone} onToggle={() => toggle('zone')} action={canEdit ? <Button size="sm" variant="ghost" onClick={autoLayout}>自動排版</Button> : undefined}><div className="relative min-h-0 flex-1 canvas-grid"><ReactFlow nodes={nodes.filter((node) => !String(node.id).startsWith('diverge-'))} edges={edges.filter((edge) => !String(edge.target).startsWith('diverge-'))} onNodesChange={canEdit ? onNodesChange : undefined} onEdgesChange={canEdit ? onEdgesChange : undefined} onConnect={canEdit ? onConnect : undefined} onNodeClick={(_, node) => setSelectedNode(node.id)} nodesDraggable={canEdit} nodesConnectable={canEdit} fitView><Background gap={18} size={1} color="var(--border)" /><Controls showInteractive={canEdit} /><MiniMap className="!bg-surface" /></ReactFlow>{!nodes.some((node) => !String(node.id).startsWith('diverge-')) && <div className="pointer-events-none absolute inset-0 grid place-items-center"><p className="rounded-primary border border-border bg-surface p-4 text-center text-sm text-muted">從資料池建立核心架構節點</p></div>}</div></CanvasArea><CanvasArea title="發散思考區" subtitle="Divergence" icon={<Bot className="size-4" />} collapsed={collapsed.diverge} onToggle={() => toggle('diverge')} action={canEdit ? <Button size="sm" variant="ghost" onClick={autoLayout}>自動排版</Button> : undefined}><div className="relative flex min-h-0 flex-1 flex-col canvas-grid"><ReactFlow nodes={nodes.filter((node) => String(node.id).startsWith('diverge-'))} edges={edges.filter((edge) => String(edge.target).startsWith('diverge-'))} onNodesChange={canEdit ? onNodesChange : undefined} onEdgesChange={canEdit ? onEdgesChange : undefined} onNodeClick={(_, node) => setSelectedNode(node.id)} nodesDraggable={canEdit} fitView><Background gap={18} size={1} color="var(--border)" /><Controls showInteractive={canEdit} /></ReactFlow>{!nodes.some((node) => String(node.id).startsWith('diverge-')) && <div className="pointer-events-none absolute inset-0 grid place-items-center"><p className="rounded-primary border border-dashed border-border bg-surface p-4 text-center text-sm text-muted">從 AI 對話加入想法節點</p></div>}</div></CanvasArea><CanvasArea title="收斂總結區" subtitle="Convergence" icon={<Sparkles className="size-4" />} collapsed={collapsed.converge} onToggle={() => toggle('converge')}><div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"><div className="flex-1 rounded-primary border border-border bg-surface p-4 text-sm leading-7">{summary || '整理前兩區的內容，產生結論與下一步。'}</div><Button onClick={converge} disabled={busy || (!resources.length && !nodes.length)}><Sparkles className="size-4" />AI 收斂總結</Button></div></CanvasArea></div>
  </div></div>;
}
function AreaHeader({ title, subtitle, icon, collapsed, onToggle, left, action }: { title: string; subtitle: string; icon: React.ReactNode; collapsed: boolean; onToggle: () => void; left?: boolean; action?: React.ReactNode }) { const visualIcon = title === '資料架構區' ? <Link2 className="size-4" /> : icon; return <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3"><span className="grid size-7 place-items-center rounded-primary bg-primary/20 text-primary">{visualIcon}</span>{!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{title}</p><p className="text-[10px] tracking-wide text-muted">{subtitle}</p></div>}{!collapsed && action}<Button variant="ghost" size="icon" className="ml-auto size-8" onClick={onToggle} aria-label={collapsed ? `展開${title}` : `收合${title}`}>{collapsed ? <PanelLeftOpen className="size-4" /> : left ? <PanelLeftClose className="size-4" /> : <PanelRightClose className="size-4" />}</Button></header>; }
function CanvasArea({ title, subtitle, icon, collapsed, onToggle, action, children }: { title: string; subtitle: string; icon: React.ReactNode; collapsed: boolean; onToggle: () => void; action?: React.ReactNode; children: React.ReactNode }) {
  const nodeArea = subtitle === 'Data Zone' ? 'zone' : subtitle === 'Divergence' ? 'diverge' : subtitle === 'Convergence' ? 'converge' : undefined;
  const areaAction = action || (nodeArea === 'converge' ? <Button size="sm" variant="ghost" onClick={() => window.dispatchEvent(new Event('context-flow:layout-converge'))}>自動排版</Button> : undefined);
  return <section className="workspace-area flex min-h-0 min-w-0 overflow-hidden bg-surface"><div className="flex min-h-0 min-w-0 flex-1 flex-col"><AreaHeader title={title} subtitle={subtitle} icon={icon} collapsed={collapsed} onToggle={onToggle} action={areaAction} />{nodeArea && <NodeEditor area={nodeArea} />}{!collapsed && <>{nodeArea && <NodeToolbar area={nodeArea} />}{nodeArea === 'converge' && <ConvergenceNodeLayer />}{children}</>}</div></section>;
}

function NodeEditor({ area }: { area: 'zone' | 'diverge' | 'converge' }) {
  const [draft, setDraft] = useState<(CanvasNodeEditEvent & { color: string; area?: 'zone' | 'diverge'; mode: 'create' | 'edit' }) | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const openEdit = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEditEvent>).detail;
      const belongsToArea = area === 'diverge' ? detail?.id.startsWith('diverge-') : area === 'converge' ? detail?.id.startsWith('converge-') : detail ? !detail.id.startsWith('diverge-') && !detail.id.startsWith('converge-') : false;
      if (detail && belongsToArea) setDraft({ ...detail, title: detail.title === '文字節點' || detail.title === '連結標題' ? '' : detail.title, content: detail.content === '輸入你的想法…' || detail.content.startsWith('貼上網址') ? '' : detail.content, mode: 'edit', color: '#fdf5f6' });
    };
    const openCreate = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeDialogEvent>).detail;
      if (detail && detail.area === area) setDraft({ ...detail, id: '', mode: 'create', color: '#fdf5f6' });
    };
    window.addEventListener('context-flow:edit-node', openEdit);
    window.addEventListener('context-flow:open-create-node', openCreate);
    return () => { window.removeEventListener('context-flow:edit-node', openEdit); window.removeEventListener('context-flow:open-create-node', openCreate); };
  }, []);
  if (!draft) return null;
  const colors = [{ label: '粉紅', value: '#fdf5f6' }, { label: '奶油', value: '#fdf9ec' }, { label: '薄荷', value: '#f1f9f6' }, { label: '薰衣草', value: '#f6f4fc' }];
  const setImageFile = (file?: File) => { if (file?.type.startsWith('image/')) setDraft({ ...draft, title: draft.title || file.name.replace(/\.[^.]+$/, ''), imageUrl: URL.createObjectURL(file) }); };
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/15 p-4" onMouseDown={() => setDraft(null)}><form className="w-full max-w-md rounded-primary border border-border bg-surface p-5 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (draft.mode === 'create' && draft.area) window.dispatchEvent(new CustomEvent<CanvasNodeEvent>('context-flow:add-node', { detail: { area: draft.area, kind: draft.kind, title: draft.title.trim() || '未命名節點', content: draft.content.trim(), imageUrl: draft.imageUrl } })); else window.dispatchEvent(new CustomEvent<CanvasNodeUpdateEvent>('context-flow:update-node', { detail: draft })); setDraft(null); }}><div className="mb-4"><p className="text-sm font-semibold">{draft.mode === 'create' ? '新增節點' : '編輯節點'}</p><p className="mt-1 text-xs text-muted">{draft.mode === 'create' ? '填寫完成後才會加入畫布。' : '更新內容或改變節點底色。'}</p></div><label className="mb-3 block text-xs font-medium">標題<Input className="mt-1" autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>{draft.kind === 'image' && <div className="mb-3 space-y-2"><label className="block text-xs font-medium">圖片連結<Input className="mt-1" value={draft.imageUrl || ''} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} placeholder="https://…" /></label><label className="grid min-h-28 cursor-pointer place-items-center rounded-primary border border-dashed border-primary/40 bg-primary/5 text-center text-xs text-muted transition-colors hover:border-primary hover:bg-primary/10" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setImageFile(event.dataTransfer.files[0]); }}><div><Upload className="mx-auto mb-1 size-5 text-primary" /><p>拖曳本機圖片到這裡</p><p className="mt-1 text-[11px]">或點擊選擇圖片</p></div><input ref={imageInput} className="sr-only" type="file" accept="image/*" onChange={(event) => { setImageFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>{draft.imageUrl && <img className="max-h-32 w-full rounded-primary border border-border object-cover" src={draft.imageUrl} alt="圖片預覽" />}</div>}<label className="mb-4 block text-xs font-medium">{draft.kind === 'link' ? '連結網址' : '內容'}<textarea className="mt-1 min-h-28 w-full resize-y rounded-primary border border-border bg-background p-2 text-sm outline-none focus:border-primary" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder={draft.kind === 'link' ? 'https://…' : undefined} /></label><div className="mb-5 flex items-center gap-2"><span className="text-xs font-medium">底色</span>{colors.map((color) => <button key={color.value} type="button" className={`size-7 rounded-full border ${draft.color === color.value ? 'ring-2 ring-primary ring-offset-2' : 'border-border'}`} style={{ background: color.value }} onClick={() => setDraft({ ...draft, color: color.value })} aria-label={color.label} />)}</div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>取消</Button><Button type="submit">{draft.mode === 'create' ? '新增節點' : '儲存變更'}</Button></div></form></div>;
}

function NodeToolbar({ area }: { area: 'zone' | 'diverge' | 'converge' }) {
  const openCreate = (kind: CanvasNodeKind) => window.dispatchEvent(new CustomEvent<CanvasNodeDialogEvent>('context-flow:open-create-node', { detail: { mode: 'create', area, kind, title: '', content: '', imageUrl: '' } }));
  return <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-3 py-2"><span className="mr-1 text-[11px] text-muted">新增節點</span><ToolbarIcon label="文字節點" onClick={() => openCreate('text')}><FileText className="size-4" /></ToolbarIcon><ToolbarIcon label="連結節點" onClick={() => openCreate('link')}><Link2 className="size-4" /></ToolbarIcon><ToolbarIcon label="圖片節點" onClick={() => openCreate('image')}><Image className="size-4" /></ToolbarIcon><span className="ml-auto text-[10px] text-muted">選取後 Delete 刪除</span></div>;
}

function ConvergenceNodeLayer() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    const addNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEvent>).detail;
      if (!detail || detail.area !== 'converge') return;
      const id = `converge-${crypto.randomUUID()}`;
      setNodes((current) => [...current, { id, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: { x: 80 + (current.length % 3) * 250, y: 70 + Math.floor(current.length / 3) * 180 }, data: { label: canvasNodeLabel(id, detail.kind, detail.title, detail.content, detail.imageUrl) }, style: nodeStyle('converge') }]);
    };
    const updateNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeUpdateEvent>).detail;
      if (!detail || !detail.id.startsWith('converge-')) return;
      setNodes((current) => current.map((node) => node.id === detail.id ? { ...node, data: { ...node.data, label: canvasNodeLabel(node.id, detail.kind, detail.title, detail.content, detail.imageUrl) }, style: { ...node.style, background: detail.color } } : node));
    };
    const addResult = (event: Event) => {
      const content = String((event as CustomEvent<{ content?: string }>).detail?.content || '');
      const parts = content.split(/\n+|(?<=[。！？!?；;])\s*/).map((part) => part.replace(/^\s*(?:#{1,4}\s+|[-*•]|\d+[.)、])\s*/, '').trim()).filter(Boolean);
      if (!parts.length) return;
      const created = parts.map((part, index) => { const id = `converge-${crypto.randomUUID()}`; return { id, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: { x: 80 + (index % 2) * AUTO_LAYOUT_COLUMN_GAP, y: 70 + Math.floor(index / 2) * AUTO_LAYOUT_ROW_GAP }, data: { label: canvasNodeLabel(id, 'text', `收斂重點 ${index + 1}`, part) }, style: nodeStyle('converge') }; });
      setNodes((current) => [...current, ...created]);
      setEdges((current) => [...current, ...created.slice(1).map((node, index) => ({ id: `converge-edge-${crypto.randomUUID()}`, source: created[index].id, target: node.id, type: 'bezier' as const }))]);
    };
    window.addEventListener('context-flow:add-node', addNode);
    window.addEventListener('context-flow:add-convergence-result', addResult);
    window.addEventListener('context-flow:update-node', updateNode);
    const updateEdge = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (!detail?.id.startsWith('converge-')) return; setEdges((current) => current.map((edge) => edge.id === detail.id ? { ...edge, label: detail.label } : edge)); };
    window.addEventListener('context-flow:update-edge', updateEdge);
    const layoutNodes = () => setNodes((current) => current.map((node, index) => ({ ...node, position: { x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP, y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP } })));
    window.addEventListener('context-flow:layout-converge', layoutNodes);
    return () => { window.removeEventListener('context-flow:add-node', addNode); window.removeEventListener('context-flow:add-convergence-result', addResult); window.removeEventListener('context-flow:update-node', updateNode); window.removeEventListener('context-flow:update-edge', updateEdge); window.removeEventListener('context-flow:layout-converge', layoutNodes); };
  }, [setNodes, setEdges]);
  return <div className="relative min-h-48 min-w-0 flex-1 canvas-grid"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodesDraggable nodesConnectable fitView><Background gap={18} size={1} color="var(--border)" /><Controls /></ReactFlow>{!nodes.length && <div className="pointer-events-none absolute inset-0 grid place-items-center"><p className="rounded-primary border border-dashed border-border bg-surface p-3 text-center text-xs text-muted">新增收斂節點，整理結論與決策</p></div>}</div>;
}

function ToolbarIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <div className="group relative"><Button type="button" size="icon" variant="ghost" className="size-8" onClick={onClick} aria-label={label}>{children}</Button><span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-primary border border-border bg-surface px-2 py-1 text-[11px] text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">{label}</span></div>;
}
async function fileFingerprint(file: File) { const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
function ResourceComposer({ onAdd }: { onAdd: (resource: DataResource) => void }) {
  const [kind, setKind] = useState<DataResourceKind>('text'); const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [url, setUrl] = useState('');
  const addFile = async (file?: File) => { if (!file) return; const isImage = file.type.startsWith('image/'); const text = !isImage && file.size < 512000 && file.type.startsWith('text/') ? (await file.text()).slice(0, 8000) : ''; onAdd({ id: crypto.randomUUID(), kind: isImage ? 'image' : 'file', title: file.name, content: text || `${file.name} (${Math.ceil(file.size / 1024)} KB)`, contentHash: await fileFingerprint(file) }); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!title.trim()) return; onAdd({ id: crypto.randomUUID(), kind, title: title.trim(), content: kind === 'text' ? content.trim() : undefined, url: kind === 'link' ? url.trim() : undefined }); setTitle(''); setContent(''); setUrl(''); };
  return <div className="space-y-3 rounded-primary border border-dashed border-primary/40 bg-primary/10 p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFile(event.dataTransfer.files[0]); }}><div className="flex flex-wrap gap-1"><Button size="sm" type="button" variant={kind === 'text' ? 'default' : 'ghost'} onClick={() => setKind('text')}><FileText className="size-3.5" />文字</Button><Button size="sm" type="button" variant={kind === 'link' ? 'default' : 'ghost'} onClick={() => setKind('link')}><Link2 className="size-3.5" />連結</Button><Button size="sm" type="button" variant={kind === 'file' ? 'default' : 'ghost'} onClick={() => setKind('file')}><Upload className="size-3.5" />檔案</Button></div>{kind === 'file' && <label className="grid min-h-28 cursor-pointer place-items-center rounded-primary border border-dashed border-border bg-surface/70 text-center text-xs text-muted hover:border-primary hover:bg-primary/10"><div><Upload className="mx-auto mb-1 size-5 text-primary" /><p>拖曳檔案到這裡</p><p className="mt-1 text-[11px]">或點擊選擇檔案</p></div><input className="sr-only" type="file" onChange={(event) => { void addFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>}{kind !== 'file' && <form className="space-y-2" onSubmit={submit}><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="資料標題" required />{kind === 'text' ? <textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-16 w-full resize-none rounded-primary border border-border bg-surface p-2 text-xs" placeholder="貼上筆記或文字…" /> : <Input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://…" required />}<Button type="submit" size="sm" className="w-full"><Plus className="size-3.5" />加入資料池</Button></form>}</div>;
}
function ResourceItem({ resource, onRemove }: { resource: DataResource; onRemove: () => void }) { const Icon = resource.kind === 'link' ? Link2 : resource.kind === 'image' ? Image : FileText; return <div className="group rounded-primary border border-border bg-surface p-2.5"><div className="flex items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{resource.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{resource.content || resource.url || '等待解析'}</p></div><button type="button" className="invisible group-hover:visible" onClick={onRemove} aria-label={`移除 ${resource.title}`}><X className="size-3.5" /></button></div></div>; }
