'use client';

import { useGSAP } from '@gsap/react';
import { Background, Controls, MiniMap, Position, ReactFlow as BaseReactFlow, addEdge, type Connection, type Edge, type Node, useEdgesState, useNodesState } from '@xyflow/react';
import gsap from 'gsap';
import { IconArrowLeft as ArrowLeft, IconRobot as Bot, IconCopy as Copy, IconFileText as FileText, IconPhoto as Image, IconLink as Link2, IconLoader2 as Loader2, IconMessageCircle as MessageCircle, IconLayoutSidebarLeftCollapse as PanelLeftClose, IconLayoutSidebarLeftExpand as PanelLeftOpen, IconLayoutSidebarRightCollapse as PanelRightClose, IconPlus as Plus, IconRefresh as RefreshCw, IconSend as Send, IconSparkles as Sparkles, IconNote as StickyNote, IconUpload as Upload, IconX as X, IconColumns3 as LayoutGrid, IconMap as MapIcon } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createPortal } from 'react-dom';
import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { askProjectAssistant, generateDataZone, getProject } from '@/lib/api/projects';
import { useAuthStore } from '@/stores/auth-store';
import { useVerticalSplit } from './resizable-left-panel';
import type { DataResource, DataResourceKind, DataZoneStructure, Project } from '@/lib/api/types';

type FlowProps = ComponentProps<typeof BaseReactFlow>;
function ReactFlow(props: FlowProps) {
  const onEdgeDoubleClick = (_event: React.MouseEvent, edge: Edge) => {
    const source = String(edge.source);
    const area = source.startsWith('converge-') ? 'converge' : source.startsWith('diverge-') ? 'diverge' : 'zone';
    window.dispatchEvent(new CustomEvent<EdgeEditEvent>('context-flow:open-edit-edge', { detail: { id: edge.id, label: edge.label ? String(edge.label) : '', area } }));
  };
  return <BaseReactFlow {...props} nodesConnectable={props.nodesConnectable ?? props.nodesDraggable} onConnect={(connection) => { if (props.onConnect) props.onConnect(connection); else window.dispatchEvent(new CustomEvent<Connection>('context-flow:connect', { detail: connection })); }} selectionOnDrag={false} panOnDrag={true} onEdgeDoubleClick={onEdgeDoubleClick} onPaneContextMenu={(event) => { event.preventDefault(); props.onPaneContextMenu?.(event); }}>{props.children}<MiniMapToggle /></BaseReactFlow>;
}

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
type CanvasNodeEditEvent = Pick<CanvasNodeEvent, 'kind' | 'title' | 'content' | 'imageUrl'> & { id: string; color?: string };
type CanvasNodeUpdateEvent = CanvasNodeEditEvent & { color: string };
type CanvasNodeDialogEvent = CanvasNodeEvent & { mode: 'create' };
type PreviewDraft = { id: string; title: string; content: string; kind?: 'core' | 'reference' | 'insight'; color?: string; parentId?: string };
type NodePreview = { area: 'zone' | 'diverge'; drafts: PreviewDraft[]; relations: { source: string; target: string; label?: string }[]; resourceIds?: string[] };
type EdgeEditEvent = { id: string; label: string; area?: 'zone' | 'diverge' | 'converge' };
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
  const positioned = nodes.map((node) => { const depth = rank.get(node.id) || 0; const siblings = columns.get(depth) || []; return { ...node, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: { x: 80 + siblings.findIndex((item) => item.id === node.id) * AUTO_LAYOUT_COLUMN_GAP, y: 80 + depth * AUTO_LAYOUT_ROW_GAP } }; });
  for (let depth = maxDepth - 1; depth >= 0; depth -= 1) positioned.filter((node) => (rank.get(node.id) || 0) === depth).forEach((node) => { const childPositions = (children.get(node.id) || []).map((id) => positioned.find((item) => item.id === id)?.position.x).filter((x): x is number => x !== undefined); if (childPositions.length) node.position.x = childPositions.reduce((sum, x) => sum + x, 0) / childPositions.length; });
  return positioned;
}
function layoutDivergence(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((node) => node.id)); const children = new Map<string, string[]>(); const incoming = new Map<string, number>(); nodes.forEach((node) => { children.set(node.id, []); incoming.set(node.id, 0); }); edges.forEach((edge) => { if (!ids.has(edge.source) || !ids.has(edge.target)) return; children.get(edge.source)?.push(edge.target); incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1); });
  const roots = nodes.filter((node) => incoming.get(node.id) === 0); const positions = new Map<string, { x: number; y: number }>(); const branchRoots = roots.length === 1 && (children.get(roots[0].id)?.length || 0) > 1 ? children.get(roots[0].id)! : roots; if (branchRoots.length !== roots.length) positions.set(roots[0].id, { x: 80 + ((branchRoots.length - 1) * AUTO_LAYOUT_COLUMN_GAP) / 2, y: 70 }); branchRoots.forEach((rootId, rootIndex) => { const queue: string[] = [rootId]; let row = branchRoots.length !== roots.length ? 1 : 0; while (queue.length) { const id = queue.shift()!; positions.set(id, { x: 80 + rootIndex * AUTO_LAYOUT_COLUMN_GAP, y: 70 + row * AUTO_LAYOUT_ROW_GAP }); row += 1; children.get(id)?.forEach((child) => queue.push(child)); } });
  const positioned = nodes.map((node, index) => ({ ...node, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: positions.get(node.id) || { x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP, y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP } }));
  [...positioned].sort((left, right) => right.position.y - left.position.y).forEach((node) => { const childPositions = (children.get(node.id) || []).map((id) => positioned.find((item) => item.id === id)?.position.x).filter((x): x is number => x !== undefined); if (childPositions.length) node.position.x = childPositions.reduce((sum, x) => sum + x, 0) / childPositions.length; });
  return positioned;
}
function canvasNodeLabel(id: string, kind: CanvasNodeKind, title: string, content: string, imageUrl?: string, color?: string) {
  const Icon = kind === 'note' ? StickyNote : kind === 'link' ? Link2 : kind === 'image' ? Image : FileText;
  const safeLink = /^https?:\/\//i.test(content) ? content : undefined;
  return <div className="max-h-56 overflow-y-auto pr-1" onDoubleClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent<CanvasNodeEditEvent>('context-flow:edit-node', { detail: { id, kind, title, content, imageUrl, color } })); }} title="雙擊編輯"><div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium opacity-65"><Icon className="size-3.5" />{kind === 'note' ? '便條' : kind === 'link' ? '連結' : kind === 'image' ? '圖片' : '文字'}</div><p className="font-semibold">{title}</p>{kind === 'image' && imageUrl ? <img className="mt-2 max-h-32 w-full rounded object-cover" src={imageUrl} alt={title} /> : kind === 'link' && safeLink ? <a className="mt-1 block truncate text-xs leading-5 text-primary underline underline-offset-2" href={safeLink} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{content}</a> : <div className="markdown-content mt-1 text-xs leading-5 opacity-70"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>}</div>;
}
function MarkdownMessage({ text }: { text: string }) {
  return <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>;
}
function MiniMapToggle() {
  const [open, setOpen] = useState(false);
  return <div className="mini-map-toggle absolute bottom-3 right-3 z-10"><span className="icon-tooltip" data-tooltip={open ? '隱藏小地圖' : '顯示小地圖'}><button type="button" className="relative z-10 grid size-8 place-items-center rounded-primary border border-border bg-surface/95 text-muted shadow-sm hover:text-foreground" onClick={() => setOpen((value) => !value)} aria-label={open ? '隱藏小地圖' : '顯示小地圖'}><MapIcon className="size-4" /></button></span>{open && <MiniMap className="!absolute !bottom-10 !right-0 !h-28 !w-36 !bg-surface" />}</div>;
}
function NodePreviewPanel({ preview, onChange, onCancel, onCommit }: { preview: NodePreview; onChange: (drafts: PreviewDraft[]) => void; onCancel: () => void; onCommit: () => void }) {
  const areaName = preview.area === 'zone' ? '資料架構區' : '發散思考區';
  return <section className="mt-3 rounded-primary border border-primary/30 bg-primary/5 p-3" aria-label={`${areaName}節點預覽`}><div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">節點預覽</p><p className="text-xs text-muted">逐筆修改後再加入畫布</p></div><Button type="button" variant="ghost" size="icon" className="size-7" onClick={onCancel} aria-label="取消預覽"><X className="size-4" /></Button></div><div className="max-h-72 space-y-3 overflow-y-auto pr-1">{preview.drafts.map((draft, index) => <div key={draft.id} className="rounded-primary border border-border bg-surface p-3"><div className="mb-2 flex items-center justify-between text-xs text-muted"><span>節點 {index + 1}</span><button type="button" className="text-primary hover:underline" onClick={() => onChange(preview.drafts.filter((item) => item.id !== draft.id))}>移除</button></div><Input value={draft.title} onChange={(event) => onChange(preview.drafts.map((item) => item.id === draft.id ? { ...item, title: event.target.value } : item))} placeholder="節點標題" /><textarea value={draft.content} onChange={(event) => onChange(preview.drafts.map((item) => item.id === draft.id ? { ...item, content: event.target.value } : item))} className="mt-2 min-h-24 w-full resize-y rounded-primary border border-border bg-background p-2 text-sm outline-none focus:border-primary" placeholder="節點內容" /></div>)}</div><div className="mt-3 flex items-center justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消</Button><Button type="button" size="sm" onClick={onCommit} disabled={!preview.drafts.length}><Plus className="size-3.5" />加入節點至{areaName}</Button></div></section>;
}
function assistantToPreview(content: string) {
  let sectionParent: string | undefined;
  let conversationRoot: string | undefined;
  let previousId: string | undefined;
  const relations: NodePreview['relations'] = [];
  const lines = content.split(/\r?\n/).flatMap((value) => { const line = value.trim(); if (!line || /^---+$/.test(line)) return []; if (/^#{1,4}\s+/.test(line) || /^[-*•]\s+|^\d+[.)、]\s+/.test(line)) return [line]; return line.length > 180 ? line.split(/(?<=[。！？!?；;])\s*/).filter(Boolean) : [line]; });
  const drafts: PreviewDraft[] = [];
  lines.forEach((line) => {
    const markdownHeading = line.match(/^#{1,4}\s+(.+)$/);
    const numberedHeading = line.match(/^\d+[.)、]\s+(.+)$/);
    const boldHeading = line.match(/^\*\*(.+?)\*\*\s*$/);
    const boldLabel = line.match(/^\*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
    const numberedIsSection = Boolean(numberedHeading && (!sectionParent || /[\u4e00-\u9fff]/.test(numberedHeading[1]) || /[&＆]/.test(numberedHeading[1])));
    const isHeading = Boolean(markdownHeading || boldHeading || numberedIsSection);
    const cleaned = isHeading ? (markdownHeading?.[1] || numberedHeading?.[1] || boldHeading?.[1] || '').trim() : line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)、]\s+/, '').trim();
    if (!cleaned || /^(以下|首先|接下來|總結如下|希望這些|好的[，。]?)/.test(cleaned)) return;
    const labelled = !isHeading ? (boldLabel ? { 1: boldLabel[1], 2: boldLabel[2] } : cleaned.match(/^([^：:]{1,18})[：:](.+)$/)) : null;
    const id = `preview-${crypto.randomUUID()}`;
    const body = isHeading ? '' : labelled?.[2]?.trim() || cleaned;
    const inferredTitle = labelled?.[1]?.trim() || cleaned.split(/[。！？!?；;：:]/)[0].trim();
    const rawTitle = isHeading ? cleaned : inferredTitle;
    const fallbackTitle = (/^(細項|內容|說明|重點|其他)$/.test(rawTitle) ? body.split(/[。！？!?；;：:]/)[0].trim() : rawTitle).replace(/\*{1,3}/g, '').trim();
    const title = fallbackTitle.slice(0, 42) || `未命名主題 ${drafts.length + 1}`;
    const draft: PreviewDraft = { id, title, content: body.length > 160 ? `${body.slice(0, 160).trim()}…` : body };
    drafts.push(draft);
    if (!conversationRoot && !isHeading && !sectionParent) conversationRoot = id;
    if (isHeading) { if (conversationRoot && conversationRoot !== previousId) relations.push({ source: conversationRoot, target: id, label: '主題分支' }); sectionParent = id; if (!conversationRoot) conversationRoot = id; }
    else if (sectionParent) relations.push({ source: sectionParent, target: id });
    else if (previousId) relations.push({ source: previousId, target: id });
    previousId = id;
  });
  return { drafts, relations };
}
function colorsByPath(drafts: PreviewDraft[], relations: NodePreview['relations']) {
  const palette = ['var(--node-context)', 'var(--node-reference)', 'var(--node-idea)', 'var(--node-outcome)', '#ffffff'];
  const draftIds = new Set(drafts.map((draft) => draft.id));
  const children = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  drafts.forEach((draft) => { children.set(draft.id, []); incoming.set(draft.id, 0); });
  relations.forEach((relation) => { if (!draftIds.has(relation.source) || !draftIds.has(relation.target)) return; children.get(relation.source)?.push(relation.target); incoming.set(relation.target, (incoming.get(relation.target) || 0) + 1); });
  const depth = new Map<string, number>();
  const queue = drafts.filter((draft) => incoming.get(draft.id) === 0).map((draft) => draft.id);
  queue.forEach((id) => depth.set(id, 0));
  while (queue.length) { const id = queue.shift()!; (children.get(id) || []).forEach((child) => { const nextDepth = (depth.get(id) || 0) + 1; if (nextDepth > (depth.get(child) ?? -1)) depth.set(child, nextDepth); queue.push(child); }); }
  const colors = new Map<string, string>();
  drafts.forEach((draft) => colors.set(draft.id, draft.color || palette[(depth.get(draft.id) || 0) % palette.length]));
  return colors;
}
function ChatActionBar({ content: _content, onRegenerate, onCopy, onCreateNodes }: { content: string; onRegenerate: () => void; onCopy: () => void; onCreateNodes: () => void }) {
  return <div className="chat-message-actions mt-2 flex items-center gap-1 text-[11px] text-muted"><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary" onClick={onRegenerate}><RefreshCw className="size-3" />重做</button><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary" onClick={onCopy}><Copy className="size-3" />複製</button><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 text-primary hover:bg-primary/10" onClick={onCreateNodes}><Plus className="size-3" />產生節點</button><button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary" onClick={() => window.dispatchEvent(new Event('context-flow:new-conversation'))}>新對話</button></div>;
}

export function ProjectCanvas({ projectId }: { projectId: string }) {
  const router = useRouter(); const root = useRef<HTMLDivElement>(null); const { containerRef: leftPanelRef, topPercent, beginDrag } = useVerticalSplit(); const [project, setProject] = useState<Project | null>(null); const [resources, setResources] = useState<DataResource[]>([]); const [processedResourceIds, setProcessedResourceIds] = useState<string[]>([]); const [structure, setStructure] = useState<DataZoneStructure | null>(null); const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]); const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]); const [collapsed, setCollapsed] = useState<Record<Area, boolean>>({ pool: false, zone: false, diverge: false, converge: false }); const [layout, setLayout] = useState<'row' | 'column'>('row'); const [selectedNode, setSelectedNode] = useState<string>(); const [prompt, setPrompt] = useState(''); const [answer, setAnswer] = useState(''); const [messages, setMessages] = useState<{role: 'user' | 'assistant'; content: string}[]>([]); const [summary, setSummary] = useState(''); const [nodePreview, setNodePreview] = useState<NodePreview | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const conversationMessages = useRef<Record<string, { role: 'user' | 'assistant'; content: string }[]>>({ general: [] });
  const [structureBusy, setStructureBusy] = useState(false);
  const [convergeBusy, setConvergeBusy] = useState(false);
  const rightDragEdge = useRef<string>(); const rightDragging = useRef(false); const rightSelectionStart = useRef<{ x: number; y: number; scope: Element }>();
  const conversationHistory = useRef<Record<string, string[]>>({ general: [] });
  const lastDivergenceNode = useRef<string>();
  const activeConversation = useRef('general');
  const currentUser = useAuthStore((state) => state.user);
  useEffect(() => {
    const element = root.current; if (!element) return;
    const onPointerDown = (event: PointerEvent) => { if (event.button === 2) { rightDragging.current = true; rightDragEdge.current = undefined; rightSelectionStart.current = { x: event.clientX, y: event.clientY, scope: (event.target as Element | null)?.closest('.react-flow') || element }; event.preventDefault(); } };
    const onPointerMove = (event: PointerEvent) => { if (!rightDragging.current) return; const hit = document.elementFromPoint(event.clientX, event.clientY); const edge = hit?.closest('.react-flow__edge'); const id = edge?.getAttribute('data-id'); if (id && rightDragEdge.current !== id) { rightDragEdge.current = id; setEdges((current) => current.filter((item) => item.id !== id)); } };
    const onPointerUp = (event: PointerEvent) => { if (event.button === 2) rightDragging.current = false; const start = rightSelectionStart.current; rightSelectionStart.current = undefined; rightDragEdge.current = undefined; if (!start || event.button !== 2 || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return; const left = Math.min(start.x, event.clientX); const right = Math.max(start.x, event.clientX); const top = Math.min(start.y, event.clientY); const bottom = Math.max(start.y, event.clientY); const selected = new Set(Array.from(start.scope.querySelectorAll<HTMLElement>('.react-flow__node')).filter((node) => { const rect = node.getBoundingClientRect(); return rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom; }).map((node) => node.getAttribute('data-id')).filter((id): id is string => Boolean(id))); setNodes((current) => current.map((node) => ({ ...node, selected: selected.has(node.id) })));
    };
    const onContextMenu = (event: MouseEvent) => { event.preventDefault(); const edge = (event.target as Element | null)?.closest('.react-flow__edge'); const id = edge?.getAttribute('data-id'); if (!id) return; document.querySelector('[data-edge-menu]')?.remove(); const menu = document.createElement('button'); menu.type = 'button'; menu.dataset.edgeMenu = 'true'; menu.textContent = '刪除連線'; Object.assign(menu.style, { position: 'fixed', left: `${event.clientX + 8}px`, top: `${event.clientY + 8}px`, zIndex: '100', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'white', color: 'var(--foreground)', fontSize: '12px', boxShadow: '0 2px 8px rgb(0 0 0 / 0.14)', cursor: 'pointer' }); menu.addEventListener('click', () => { window.dispatchEvent(new CustomEvent<EdgeEditEvent>('context-flow:delete-edge', { detail: { id, label: '' } })); menu.remove(); }); document.body.appendChild(menu); };
    element.addEventListener('pointerdown', onPointerDown, true); window.addEventListener('pointermove', onPointerMove, true); window.addEventListener('pointerup', onPointerUp, true); element.addEventListener('contextmenu', onContextMenu, true);
    return () => { element.removeEventListener('pointerdown', onPointerDown, true); window.removeEventListener('pointermove', onPointerMove, true); window.removeEventListener('pointerup', onPointerUp, true); element.removeEventListener('contextmenu', onContextMenu, true); };
  }, [setNodes, setEdges]);
  useEffect(() => { const element = root.current; if (!element) return; const openEdgeEditor = (event: MouseEvent) => { const target = event.target; if (!(target instanceof Element)) return; const edge = target.closest('.react-flow__edge, [data-id]'); const id = edge?.getAttribute('data-id'); if (!id) return; const label = target.closest('.react-flow__edge-text, .react-flow__edge-textwrapper')?.textContent?.trim() || ''; const areaElement = edge?.closest('.workspace-area'); const area = areaElement?.getAttribute('data-canvas-area') as EdgeEditEvent['area']; event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent<EdgeEditEvent>('context-flow:open-edit-edge', { detail: { id, label, area } })); }; element.addEventListener('dblclick', openEdgeEditor, true); return () => element.removeEventListener('dblclick', openEdgeEditor, true); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key !== 'Delete' && event.key !== 'Backspace') return; const ids = new Set(nodes.filter((node) => node.selected).map((node) => node.id)); if (!ids.size) return; event.preventDefault(); setNodes((current) => current.filter((node) => !ids.has(node.id))); setEdges((current) => current.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target))); setSelectedNode(undefined); };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, setNodes, setEdges]);
  useEffect(() => { const host = root.current; if (!host) return; const chatForm = host.querySelector<HTMLFormElement>('textarea.max-h-28')?.closest('form'); const messagesPane = chatForm?.previousElementSibling; messagesPane?.classList.toggle('ai-thinking-messages', busy); host.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { const text = button.textContent || ''; if (text.includes('建立資料架構') || text.includes('AI 收斂總結')) button.classList.toggle('animate-pulse', busy); }); }, [busy]);
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
        return { ...node, data: { ...data, label: canvasNodeLabel(node.id, detail.kind, detail.title, detail.content, detail.imageUrl, detail.color), nodeKind: detail.kind, nodeTitle: detail.title, nodeContent: detail.content, imageUrl: detail.imageUrl, nodeColor: detail.color }, style: { ...node.style, background: detail.color } };
      }));
    };
    window.addEventListener('context-flow:add-node', addCanvasNode);
    window.addEventListener('context-flow:update-node', updateCanvasNode);
    return () => { window.removeEventListener('context-flow:add-node', addCanvasNode); window.removeEventListener('context-flow:update-node', updateCanvasNode); };
  }, [nodes, setNodes]);
  useEffect(() => { const updateEdge = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (!detail || detail.id.startsWith('converge-')) return; setEdges((current) => current.map((edge) => edge.id === detail.id ? { ...edge, label: detail.label || undefined } : edge)); }; window.addEventListener('context-flow:update-edge', updateEdge); return () => window.removeEventListener('context-flow:update-edge', updateEdge); }, [setEdges]);
  useEffect(() => { const deleteEdge = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (!detail || detail.id.startsWith('converge-')) return; setEdges((current) => current.filter((edge) => edge.id !== detail.id)); }; window.addEventListener('context-flow:delete-edge', deleteEdge); return () => window.removeEventListener('context-flow:delete-edge', deleteEdge); }, [setEdges]);
  useEffect(() => { const connect = (event: Event) => { const detail = (event as CustomEvent<Connection>).detail; if (!detail || String(detail.source).startsWith('converge-') || String(detail.target).startsWith('converge-')) return; setEdges((current) => addEdge({ ...detail, type: 'bezier', style: { stroke: 'var(--primary)' } }, current)); }; window.addEventListener('context-flow:connect', connect); return () => window.removeEventListener('context-flow:connect', connect); }, [setEdges]);
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
    const chat = root.current?.querySelector<HTMLElement>('.min-h-0.flex-1.space-y-3.overflow-y-auto');
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);
  useEffect(() => {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.forEach((button) => { const text = button.textContent || ''; if (text.includes('建立資料架構')) button.classList.toggle('animate-pulse', structureBusy); if (text.includes('AI 收斂總結')) button.classList.toggle('animate-pulse', convergeBusy); });
  }, [structureBusy, convergeBusy]);
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
  useEffect(() => { const nextConversation = selectedNode || 'general'; if (activeConversation.current === nextConversation) return; conversationMessages.current[activeConversation.current] = messages; activeConversation.current = nextConversation; setMessages(conversationMessages.current[nextConversation] || []); }, [selectedNode]);
  useEffect(() => { const resetConversation = () => { const id = activeConversation.current; conversationMessages.current[id] = []; conversationHistory.current[id] = []; setMessages([]); setAnswer(''); setNodePreview(null); }; window.addEventListener('context-flow:new-conversation', resetConversation); return () => window.removeEventListener('context-flow:new-conversation', resetConversation); }, []);
  useEffect(() => { const host = root.current; if (!host) return; const enabled = !selectedNode || selectedNode.startsWith('diverge-'); const input = host.querySelector<HTMLTextAreaElement>('textarea.max-h-28'); const send = input?.closest('form')?.querySelector<HTMLButtonElement>('button[type="submit"]'); if (input) { input.disabled = false; input.placeholder = enabled ? (selectedNode ? '針對這個節點延伸思考…' : '例如：這裡有哪些假設需要驗證？') : '目前僅能針對發散思考節點提問'; } if (send) send.disabled = !enabled || busy || !prompt.trim(); }, [selectedNode, busy, prompt]);
  useEffect(() => { const hasZone = nodes.some((node) => !String(node.id).startsWith('diverge-')); const hasDivergence = nodes.some((node) => String(node.id).startsWith('diverge-')); const button = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button') || []).find((item) => (item.textContent || '').includes('AI 收斂總結')); if (button) button.disabled = !hasZone || !hasDivergence || convergeBusy; }, [nodes, convergeBusy]);
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
  async function createStructure() { const pending = resources.filter((resource) => !processedResourceIds.includes(resource.id)); if (!pending.length) return; setStructureBusy(true); setError(''); try { const result = await generateDataZone(projectId, pending); setNodePreview({ area: 'zone', drafts: result.nodes.map((node) => ({ id: node.id, title: node.label, content: node.description, kind: node.kind })), relations: result.edges, resourceIds: pending.map((resource) => resource.id) }); } catch (reason) { setError(reason instanceof Error ? reason.message : '建立資料架構失敗'); } finally { setStructureBusy(false); } }
  async function askAssistant(event: React.FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question) return;
    if (selectedNode && !selectedNode.startsWith('diverge-')) { setError('請先選取發散思考區的節點，或取消節點選取後再使用 AI。'); return; }
    const conversationId = selectedNode || 'general';
    const activeNode = conversationId === 'general' ? undefined : nodes.find((node) => node.id === conversationId);
    const resourceContext = resources.length ? `資料池內容（請優先參考）：\n${resources.map((resource) => `- ${resource.title}: ${resource.content || resource.url || ''}`).join('\n').slice(0, 7000)}` : '資料池目前沒有內容，請以一般知識協助思考。';
    const nodeContext = activeNode ? `目前延伸的節點：${String(activeNode.data.nodeTitle || '')}\n${String(activeNode.data.nodeContent || '')}` : '目前是發散思考的共用對話。';
    const history = conversationHistory.current[conversationId] || [];
    const userContent = <div className="chat-message-shell chat-message-user"><div className="chat-message-role">{currentUser?.username || '你'}</div><div className="chat-message-bubble"><p>{question}</p></div></div> as unknown as string;
    const pendingMessages = [...messages, { role: 'user' as const, content: userContent }];
    setMessages(pendingMessages);
    setPrompt('');
    setBusy(true);
    setError('');
    try {
      const result = await askProjectAssistant(projectId, [nodeContext, resourceContext, ...history.slice(-6), `使用者：${question}`].join('\n\n'));
      const regenerate = () => { setPrompt(question); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea.max-h-28')?.closest('form')?.requestSubmit(), 0); };
      const copy = () => { void navigator.clipboard?.writeText(result.content); setError('AI 回覆已複製'); };
      const assistantContent = <div className="chat-message-shell"><div className="chat-message-role">AI</div><div className="chat-message-bubble"><MarkdownMessage text={result.content} /></div><ChatActionBar content={result.content} onRegenerate={regenerate} onCopy={copy} onCreateNodes={() => addAnswerToDivergence(result.content, conversationId === 'general' ? undefined : conversationId)} /></div> as unknown as string;
      const nextMessages = [...pendingMessages, { role: 'assistant' as const, content: assistantContent }];
      conversationMessages.current[conversationId] = nextMessages;
      conversationHistory.current[conversationId] = [...history, `使用者：${question}`, `AI：${result.content}`];
      setAnswer(result.content);
      setMessages(nextMessages);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI 請求失敗'); } finally { setBusy(false); }
  }
  function addAnswerToDivergence(content: string, parent?: string) { if (!content) return; const preview = assistantToPreview(content); const source = parent || lastDivergenceNode.current; if (source && preview.drafts[0]) preview.relations.unshift({ source, target: preview.drafts[0].id, label: parent ? '延伸' : '同一對話' }); setNodePreview({ area: 'diverge', ...preview }); }
  function commitPreview() { if (!nodePreview?.drafts.length) return; const colors = colorsByPath(nodePreview.drafts, nodePreview.relations); const ids = new Map(nodePreview.drafts.map((draft) => [draft.id, `${nodePreview.area === 'zone' ? 'ai' : 'diverge'}-${crypto.randomUUID()}`])); const created = nodePreview.drafts.map((draft, index) => { const id = ids.get(draft.id)!; const color = colors.get(draft.id) || 'var(--node-context)'; return { id, sourcePosition: Position.Bottom, targetPosition: Position.Top, position: { x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP, y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP }, data: { label: canvasNodeLabel(id, 'text', draft.title || '未命名節點', draft.content), nodeKind: 'text', nodeTitle: draft.title || '未命名節點', nodeContent: draft.content, nodeColor: color, aiGenerated: true }, style: { ...nodeStyle(nodePreview.area === 'diverge' ? 'diverge' : draft.kind === 'reference' ? 'reference' : draft.kind === 'insight' ? 'insight' : 'core'), background: color } }; }); const createdEdges = nodePreview.relations.flatMap((relation) => { const source = ids.get(relation.source) || (relation.source.startsWith('diverge-') ? relation.source : undefined); const target = ids.get(relation.target); return source && target ? [{ id: `${nodePreview.area}-edge-${crypto.randomUUID()}`, source, target, ...(relation.label ? { label: relation.label } : {}), type: 'bezier' as const, style: { stroke: 'var(--primary)' }, labelStyle: { fill: 'var(--muted)', fontSize: 11 } }] : []; }); const positioned = nodePreview.area === 'diverge' ? layoutDivergence(created, createdEdges) : layoutGraph(created, createdEdges); setNodes((current) => [...current, ...positioned]); setEdges((current) => [...current, ...createdEdges]); if (nodePreview.area === 'zone') { setProcessedResourceIds((current) => [...current, ...(nodePreview.resourceIds || [])]); } else { lastDivergenceNode.current = created[created.length - 1].id; } setNodePreview(null); }
  function autoLayout(event?: React.MouseEvent<HTMLButtonElement>) { const section = event?.currentTarget.closest('.workspace-area'); const areaIndex = section ? Array.from(root.current?.querySelectorAll('.workspace-area') || []).indexOf(section) : -1; const area = areaIndex === 1 ? 'zone' : areaIndex === 2 ? 'diverge' : areaIndex === 3 ? 'converge' : undefined; if (!area) return; if (area === 'converge') { window.dispatchEvent(new Event('context-flow:layout-converge')); return; } const prefix = `${area}-`; const scopedNodes = nodes.filter((node) => String(node.id).startsWith(prefix) || (area === 'zone' && String(node.id).startsWith('ai-'))); const scopedIds = new Set(scopedNodes.map((node) => node.id)); const scopedEdges = edges.filter((edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target)); setNodes((current) => [...current.filter((node) => !scopedIds.has(node.id)), ...layoutGraph(scopedNodes, scopedEdges)]); }
  async function converge() { setConvergeBusy(true); setError(''); try { const context = [...resources.map((item) => `${item.title}: ${item.content || item.url || ''}`), ...nodes.map((node) => String(node.data.label))].join('\n'); const result = await askProjectAssistant(projectId, `請將以下資料架構與發散思考收斂成清楚的結論、決策與下一步：\n${context}`); setSummary(result.content); setCollapsed((current) => ({ ...current, converge: false })); } catch (reason) { setError(reason instanceof Error ? reason.message : '無法產生總結'); } finally { setConvergeBusy(false); } }
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
  const compactAction = <>{areaAction && isValidElement(areaAction) ? (() => { const element = areaAction as React.ReactElement<{ className?: string }>; const iconButton = cloneElement(element, { className: `${element.props.className || ''} auto-layout-icon-button`, 'aria-label': '自動排版' }, <LayoutGrid className="size-4" />); return <span className="icon-tooltip" data-tooltip="自動排版">{iconButton}</span>; })() : areaAction}</>;
  return <section data-canvas-area={nodeArea} className="workspace-area flex min-h-0 min-w-0 overflow-hidden bg-surface"><div className="flex min-h-0 min-w-0 flex-1 flex-col"><AreaHeader title={title} subtitle={subtitle} icon={icon} collapsed={collapsed} onToggle={onToggle} action={compactAction} />{nodeArea && <NodeEditor area={nodeArea} />}{nodeArea === 'converge' && <EdgeEditor />}{!collapsed && <>{nodeArea && <NodeToolbar area={nodeArea} />}{nodeArea === 'converge' && <ConvergenceNodeLayer />}{children}</>}</div></section>;
}

function NodeEditor({ area }: { area: 'zone' | 'diverge' | 'converge' }) {
  const [draft, setDraft] = useState<(CanvasNodeEditEvent & { color: string; area?: 'zone' | 'diverge'; mode: 'create' | 'edit' }) | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const openEdit = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEditEvent>).detail;
      const belongsToArea = area === 'diverge' ? detail?.id.startsWith('diverge-') : area === 'converge' ? detail?.id.startsWith('converge-') : detail ? !detail.id.startsWith('diverge-') && !detail.id.startsWith('converge-') : false;
      if (detail && belongsToArea) setDraft({ ...detail, title: detail.title === '文字節點' || detail.title === '連結標題' ? '' : detail.title, content: detail.content === '輸入你的想法…' || detail.content.startsWith('貼上網址') ? '' : detail.content, mode: 'edit', color: detail.color || '#fdf5f6' });
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
  const colors = [{ label: '粉紅', value: '#fdf5f6' }, { label: '奶油', value: '#fdf9ec' }, { label: '薄荷', value: '#f1f9f6' }, { label: '薰衣草', value: '#f6f4fc' }, { label: '白色', value: '#ffffff' }];
  const setImageFile = (file?: File) => { if (file?.type.startsWith('image/')) setDraft({ ...draft, title: draft.title || file.name.replace(/\.[^.]+$/, ''), imageUrl: URL.createObjectURL(file) }); };
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/15 p-4" onMouseDown={() => setDraft(null)}><form className="w-full max-w-md rounded-primary border border-border bg-surface p-5 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (draft.mode === 'create' && draft.area) window.dispatchEvent(new CustomEvent<CanvasNodeEvent>('context-flow:add-node', { detail: { area: draft.area, kind: draft.kind, title: draft.title.trim() || '未命名節點', content: draft.content.trim(), imageUrl: draft.imageUrl } })); else window.dispatchEvent(new CustomEvent<CanvasNodeUpdateEvent>('context-flow:update-node', { detail: draft })); setDraft(null); }}><div className="mb-4"><p className="text-sm font-semibold">{draft.mode === 'create' ? '新增節點' : '編輯節點'}</p><p className="mt-1 text-xs text-muted">{draft.mode === 'create' ? '填寫完成後才會加入畫布。' : '更新內容或改變節點底色。'}</p></div><label className="mb-3 block text-xs font-medium">標題<Input className="mt-1" autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>{draft.kind === 'image' && <div className="mb-3 space-y-2"><label className="block text-xs font-medium">圖片連結<Input className="mt-1" value={draft.imageUrl || ''} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} placeholder="https://…" /></label><label className="grid min-h-28 cursor-pointer place-items-center rounded-primary border border-dashed border-primary/40 bg-primary/5 text-center text-xs text-muted transition-colors hover:border-primary hover:bg-primary/10" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setImageFile(event.dataTransfer.files[0]); }}><div><Upload className="mx-auto mb-1 size-5 text-primary" /><p>拖曳本機圖片到這裡</p><p className="mt-1 text-[11px]">或點擊選擇圖片</p></div><input ref={imageInput} className="sr-only" type="file" accept="image/*" onChange={(event) => { setImageFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>{draft.imageUrl && <img className="max-h-32 w-full rounded-primary border border-border object-cover" src={draft.imageUrl} alt="圖片預覽" />}</div>}<label className="mb-4 block text-xs font-medium">{draft.kind === 'link' ? '連結網址' : '內容'}<textarea className="mt-1 min-h-28 w-full resize-y rounded-primary border border-border bg-background p-2 text-sm outline-none focus:border-primary" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder={draft.kind === 'link' ? 'https://…' : undefined} /></label><div className="mb-5 flex items-center gap-2"><span className="text-xs font-medium">底色</span>{colors.map((color) => <button key={color.value} type="button" className={`size-7 rounded-full border ${draft.color === color.value ? 'ring-2 ring-primary ring-offset-2' : 'border-border'}`} style={{ background: color.value }} onClick={() => setDraft({ ...draft, color: color.value })} aria-label={color.label} />)}</div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>取消</Button><Button type="submit">{draft.mode === 'create' ? '新增節點' : '儲存變更'}</Button></div></form></div>;
}

function EdgeEditor() {
  const [draft, setDraft] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => { const open = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (detail) setDraft({ id: detail.id, label: detail.label || '' }); }; window.addEventListener('context-flow:open-edit-edge', open); return () => window.removeEventListener('context-flow:open-edit-edge', open); }, []);
  if (!draft) return null;
  return typeof document === 'undefined' ? null : createPortal(<div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/15 p-4" onMouseDown={() => setDraft(null)}><form className="w-full max-w-md rounded-primary border border-border bg-surface p-5 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent<EdgeEditEvent>('context-flow:update-edge', { detail: { id: draft.id, label: draft.label.trim() } })); setDraft(null); }}><div className="mb-4"><p className="text-sm font-semibold">編輯連線文字</p><p className="mt-1 text-xs text-muted">可輸入關係名稱，也可以留空隱藏文字。</p></div><label className="mb-4 block text-xs font-medium">連線文字<Input className="mt-1" autoFocus value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="例如：包含、依賴、延伸" /></label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDraft(null)}>取消</Button><Button type="submit">儲存變更</Button></div></form></div>, document.body);
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
      setNodes((current) => current.map((node) => node.id === detail.id ? { ...node, data: { ...node.data, label: canvasNodeLabel(node.id, detail.kind, detail.title, detail.content, detail.imageUrl, detail.color) }, style: { ...node.style, background: detail.color } } : node));
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
    const updateEdge = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (!detail?.id.startsWith('converge-')) return; setEdges((current) => current.map((edge) => edge.id === detail.id ? { ...edge, label: detail.label || undefined } : edge)); };
    const deleteEdge = (event: Event) => { const detail = (event as CustomEvent<EdgeEditEvent>).detail; if (!detail?.id.startsWith('converge-')) return; setEdges((current) => current.filter((edge) => edge.id !== detail.id)); };
    const connect = (event: Event) => { const detail = (event as CustomEvent<Connection>).detail; if (!detail || !String(detail.source).startsWith('converge-') || !String(detail.target).startsWith('converge-')) return; setEdges((current) => addEdge({ ...detail, type: 'bezier', style: { stroke: 'var(--primary)' } }, current)); };
    window.addEventListener('context-flow:update-edge', updateEdge); window.addEventListener('context-flow:delete-edge', deleteEdge); window.addEventListener('context-flow:connect', connect);
    const layoutNodes = () => setNodes((current) => current.map((node, index) => ({ ...node, position: { x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP, y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP } })));
    window.addEventListener('context-flow:layout-converge', layoutNodes);
    return () => { window.removeEventListener('context-flow:add-node', addNode); window.removeEventListener('context-flow:add-convergence-result', addResult); window.removeEventListener('context-flow:update-node', updateNode); window.removeEventListener('context-flow:update-edge', updateEdge); window.removeEventListener('context-flow:delete-edge', deleteEdge); window.removeEventListener('context-flow:connect', connect); window.removeEventListener('context-flow:layout-converge', layoutNodes); };
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
