"use client";

import { useGSAP } from "@gsap/react";
import {
  Background,
  Controls,
  MiniMap,
  Position,
  ReactFlow as BaseReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import gsap from "gsap";
import {
  IconArrowLeft as ArrowLeft,
  IconRobot as Bot,
  IconCopy as Copy,
  IconEdit as IconEdit,
  IconFileText as FileText,
  IconPhoto as ImageIcon,
  IconLink as Link2,
  IconLoader2 as Loader2,
  IconMessageCircle as MessageCircle,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconLayoutSidebarRightCollapse as PanelRightClose,
  IconPlus as Plus,
  IconRefresh as RefreshCw,
  IconSend as Send,
  IconSparkles as Sparkles,
  IconStar as Star,
  IconTrash as Trash,
  IconUpload as Upload,
  IconX as X,
  IconColumns3 as LayoutGrid,
  IconMap as MapIcon,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPortal } from "react-dom";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askProjectAssistant,
  generateDataZone,
  getCanvas,
  getProject,
  saveCanvas,
} from "@/lib/api/projects";
import { useAuthStore } from "@/stores/auth-store";
import { ProductTour } from '@/features/onboarding/product-tour';
import { useVerticalSplit } from "./resizable-left-panel";
import { findFreeNodePosition } from "./node-placement";
import { NODE_COLORS, NodeColorPicker } from "./node-color-picker";
import { buildConvergencePrompt } from "./convergence-context";
import { uploadFile, downloadFile } from "@/lib/api/files";
import { ApiError } from "@/lib/api/client";
import type {
  CanvasSnapshot,
  DataResource,
  DataResourceKind,
  Project,
} from "@/lib/api/types";
import { exportProjectPdf, exportProjectPng } from "./export-utils";
import { exportErrorMessage, readImageData } from "./image-data";
import { CanvasReplica } from './canvas-replica';
import { CanvasBackups } from './canvas-backups';
import { readSnapshot, type Snapshot } from '@context-flow/collaboration';
import type { SyncState } from './collaboration-connection';

type FlowProps = ComponentProps<typeof BaseReactFlow>;
function ReactFlow(props: FlowProps) {
  const groups = new Map(
    (props.nodes || [])
      .filter(
        (node) =>
          node.type === "group" ||
          Boolean((node.data as Record<string, unknown> | undefined)?.group),
      )
      .map((node) => [node.id, node]),
  );
  const visualNodes = props.nodes
    ?.filter((node) => !groups.has(node.id))
    .map((node) => {
      const parent = node.parentId ? groups.get(node.parentId) : undefined;
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: parent
          ? {
              x: node.position.x + parent.position.x,
              y: node.position.y + parent.position.y,
            }
          : node.position,
        style: restoredNodeStyle(node as Node),
      };
    });
  const visualEdges = props.edges
    ?.filter((edge) => !groups.has(edge.source) && !groups.has(edge.target))
    .map((edge) => ({
      ...edge,
      type: edge.type === "bezier" || !edge.type ? "default" : edge.type,
      style: { stroke: "var(--primary)", ...(edge.style || {}) },
    }));
  const onEdgeDoubleClick = (_event: React.MouseEvent, edge: Edge) => {
    if (props.nodesDraggable === false) return;
    const source = String(edge.source);
    const area = source.startsWith("converge-")
      ? "converge"
      : source.startsWith("diverge-")
        ? "diverge"
        : "zone";
    window.dispatchEvent(
      new CustomEvent<EdgeEditEvent>("context-flow:open-edit-edge", {
        detail: {
          id: edge.id,
          label: edge.label ? String(edge.label) : "",
          area,
        },
      }),
    );
  };
  return (
    <BaseReactFlow
      {...props}
      nodes={visualNodes}
      edges={visualEdges}
      minZoom={props.minZoom ?? 0.1}
      maxZoom={props.maxZoom ?? 2}
      fitViewOptions={props.fitViewOptions ?? { padding: 0.25 }}
      nodesConnectable={props.nodesConnectable ?? props.nodesDraggable}
      onConnect={(connection) => {
        if (props.onConnect) props.onConnect(connection);
        else
          window.dispatchEvent(
            new CustomEvent<Connection>("context-flow:connect", {
              detail: connection,
            }),
          );
      }}
      selectionOnDrag={false}
      panOnDrag={true}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onNodeDoubleClick={(event, node) => {
        if (props.nodesDraggable === false) return;
        event.stopPropagation();
        const data = node.data as Record<string, unknown>;
        window.dispatchEvent(
          new CustomEvent<CanvasNodeEditEvent>("context-flow:edit-node", {
            detail: {
              id: node.id,
              kind: (data.nodeKind as CanvasNodeKind) || "text",
              title: String(data.nodeTitle || "未命名節點"),
              content: String(data.nodeContent ?? data.content ?? ""),
              imageUrl: data.imageUrl as string | undefined,
              color: String(
                data.nodeColor || node.style?.background || "#fdf5f6",
              ),
            },
          }),
        );
      }}
      onPaneContextMenu={(event) => {
        event.preventDefault();
        props.onPaneContextMenu?.(event);
      }}
    >
      {props.children}
      <MiniMapToggle />
    </BaseReactFlow>
  );
}

gsap.registerPlugin(useGSAP);
type Area = "pool" | "zone" | "diverge" | "converge";
type CanvasNodeKind = "text" | "note" | "link" | "image";
type CanvasNodeEvent = {
  area: "zone" | "diverge" | "converge";
  kind: CanvasNodeKind;
  title: string;
  content: string;
  imageUrl?: string;
  color?: string;
};
type CanvasNodeEditEvent = Pick<
  CanvasNodeEvent,
  "kind" | "title" | "content" | "imageUrl"
> & { id: string; color?: string };
type CanvasNodeUpdateEvent = CanvasNodeEditEvent & { color: string };
type CanvasNodeStarEvent = { id: string };
type CanvasNodeDialogEvent = CanvasNodeEvent & { mode: "create" };
type PreviewDraft = {
  id: string;
  title: string;
  content: string;
  kind?: "core" | "reference" | "insight";
  color?: string;
  parentId?: string;
};
type NodePreview = {
  area: "zone" | "diverge";
  drafts: PreviewDraft[];
  relations: { source: string; target: string; label?: string }[];
  resourceIds?: string[];
  parentId?: string;
};
type EdgeEditEvent = {
  id: string;
  label: string;
  area?: "zone" | "diverge" | "converge";
};
const nodeStyle = (
  kind: "core" | "reference" | "insight" | "diverge" | "converge",
) => ({
  width: 220,
  borderRadius: "var(--radius-primary)",
  border: "1px solid var(--border)",
  background:
    kind === "core"
      ? "var(--node-context)"
      : kind === "converge" || kind === "diverge" || kind === "insight"
        ? "var(--node-idea)"
        : "var(--node-reference)",
  color: "var(--foreground)",
  padding: 14,
  fontSize: 13,
});
function restoredNodeStyle(node: {
  id?: string;
  style?: CSSProperties;
  data?: Record<string, unknown>;
}) {
  const data = node.data || {};
  const kind = String(data.nodeKind || "text");
  const areaKind =
    String(node.id || "").startsWith("diverge-") || data.convergenceGenerated
      ? "diverge"
      : data.aiGenerated || String(node.id || "").startsWith("ai-")
        ? "reference"
        : kind === "link"
          ? "reference"
          : kind === "note"
            ? "insight"
            : "core";
  const base = {
    ...nodeStyle(areaKind as "core" | "reference" | "insight" | "diverge"),
    ...(node.style || {}),
  };
  const stored = String(
    node.style?.background || data.nodeColor || "",
  ).toLowerCase();
  const isBlank =
    !stored ||
    stored === "#fff" ||
    stored === "#ffffff" ||
    stored === "white" ||
    stored.includes("255, 255, 255");
  return (
    isBlank
      ? { ...base, background: data.nodeColor || base.background }
      : { ...base, background: node.style?.background || data.nodeColor }
  ) as CSSProperties;
}
const AUTO_LAYOUT_COLUMN_GAP = 340;
const AUTO_LAYOUT_ROW_GAP = 280;
function layoutGraph(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const rank = new Map<string, number>();
  nodes.forEach((node) => {
    children.set(node.id, []);
    parents.set(node.id, []);
    incoming.set(node.id, 0);
    rank.set(node.id, 0);
  });
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return;
    children.get(edge.source)?.push(edge.target);
    parents.get(edge.target)?.push(edge.source);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });
  const queue = nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    visited.add(id);
    children.get(id)?.forEach((child) => {
      rank.set(child, Math.max(rank.get(child) || 0, (rank.get(id) || 0) + 1));
      incoming.set(child, (incoming.get(child) || 1) - 1);
      if (incoming.get(child) === 0) queue.push(child);
    });
  }
  nodes
    .filter((node) => !visited.has(node.id))
    .forEach((node, index) => rank.set(node.id, index + 1));
  const columns = new Map<number, Node[]>();
  nodes.forEach((node) => {
    const depth = rank.get(node.id) || 0;
    columns.set(depth, [...(columns.get(depth) || []), node]);
  });
  const maxDepth = Math.max(...Array.from(columns.keys()));
  const reorder = (
    depth: number,
    related: Map<string, string[]>,
    relatedDepth: number,
  ) => {
    const layer = columns.get(depth) || [];
    const nearby = columns.get(relatedDepth) || [];
    const nearbyOrder = new Map(nearby.map((node, index) => [node.id, index]));
    const score = (node: Node) => {
      const positions = (related.get(node.id) || [])
        .filter((id) => rank.get(id) === relatedDepth)
        .map((id) => nearbyOrder.get(id))
        .filter((index): index is number => index !== undefined);
      return positions.length
        ? positions.reduce((sum, index) => sum + index, 0) / positions.length
        : Number.MAX_SAFE_INTEGER;
    };
    columns.set(
      depth,
      [...layer].sort((left, right) => {
        const byPosition = score(left) - score(right);
        if (byPosition) return byPosition;
        const leftParent = (related.get(left.id) || [])[0] || "";
        const rightParent = (related.get(right.id) || [])[0] || "";
        return leftParent.localeCompare(rightParent);
      }),
    );
  };
  for (let pass = 0; pass < 3; pass += 1) {
    for (let depth = 1; depth <= maxDepth; depth += 1)
      reorder(depth, parents, depth - 1);
    for (let depth = maxDepth - 1; depth >= 0; depth -= 1)
      reorder(depth, children, depth + 1);
  }
  const positioned = nodes.map((node) => {
    const depth = rank.get(node.id) || 0;
    const siblings = columns.get(depth) || [];
    return {
      ...node,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      position: {
        x:
          80 +
          siblings.findIndex((item) => item.id === node.id) *
            AUTO_LAYOUT_COLUMN_GAP,
        y: 80 + depth * AUTO_LAYOUT_ROW_GAP,
      },
    };
  });
  for (let depth = maxDepth - 1; depth >= 0; depth -= 1)
    positioned
      .filter((node) => (rank.get(node.id) || 0) === depth)
      .forEach((node) => {
        const childPositions = (children.get(node.id) || [])
          .map((id) => positioned.find((item) => item.id === id)?.position.x)
          .filter((x): x is number => x !== undefined);
        if (childPositions.length)
          node.position.x =
            childPositions.reduce((sum, x) => sum + x, 0) /
            childPositions.length;
      });
  const firstLayer = columns.get(1) || [];
  const branchOrder = new Map(
    firstLayer.map((node, index) => [node.id, index]),
  );
  const branchKey = (id: string) => {
    let current = id;
    const seen = new Set<string>();
    while ((rank.get(current) || 0) > 1 && !seen.has(current)) {
      seen.add(current);
      current = parents.get(current)?.[0] || current;
    }
    return current;
  };
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const layer = positioned
      .filter((node) => (rank.get(node.id) || 0) === depth)
      .sort((left, right) => {
        const byBranch =
          (branchOrder.get(branchKey(left.id)) ?? Number.MAX_SAFE_INTEGER) -
          (branchOrder.get(branchKey(right.id)) ?? Number.MAX_SAFE_INTEGER);
        return byBranch || left.position.x - right.position.x;
      });
    layer.forEach((node, index) => {
      if (index > 0)
        node.position.x = Math.max(
          node.position.x,
          layer[index - 1].position.x + AUTO_LAYOUT_COLUMN_GAP,
        );
    });
  }
  return positioned;
}
function layoutDivergence(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  nodes.forEach((node) => {
    children.set(node.id, []);
    incoming.set(node.id, 0);
  });
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return;
    children.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });
  const roots = nodes.filter((node) => incoming.get(node.id) === 0);
  const rootIds = roots.map((node) => node.id);
  const firstRootId = rootIds[0];
  const positions = new Map<string, { x: number; y: number }>();
  const splitRoot = Boolean(
    firstRootId &&
    roots.length === 1 &&
    (children.get(firstRootId)?.length || 0) > 1,
  );
  const branchRoots = splitRoot ? children.get(firstRootId!)! : rootIds;
  if (splitRoot && firstRootId)
    positions.set(firstRootId, {
      x: 80 + ((branchRoots.length - 1) * AUTO_LAYOUT_COLUMN_GAP) / 2,
      y: 70,
    });
  branchRoots.forEach((rootId, rootIndex) => {
    const queue: Array<{ id: string; depth: number }> = [
      { id: rootId, depth: splitRoot ? 1 : 0 },
    ];
    while (queue.length) {
      const current = queue.shift()!;
      positions.set(current.id, {
        x: 80 + rootIndex * AUTO_LAYOUT_COLUMN_GAP,
        y: 70 + current.depth * AUTO_LAYOUT_ROW_GAP,
      });
      children
        .get(current.id)
        ?.forEach((child) =>
          queue.push({ id: child, depth: current.depth + 1 }),
        );
    }
  });
  const positioned = nodes.map((node, index) => ({
    ...node,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    position: positions.get(node.id) || {
      x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP,
      y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP,
    },
  }));
  // Keep each branch in its own column. Averaging every parent's x position
  // pulls neighbouring branches across one another and makes the tree look
  // interleaved after auto-layout.
  return positioned;
}
function layoutConvergence(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  nodes.forEach((node) => {
    children.set(node.id, []);
    incoming.set(node.id, 0);
  });
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return;
    children.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });
  const roots = nodes.filter((node) => incoming.get(node.id) === 0);
  const depth = new Map<string, number>();
  const widths = new Map<string, number>();
  const visiting = new Set<string>();
  const subtreeWidth = (id: string): number => {
    if (widths.has(id)) return widths.get(id)!;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const branch = (children.get(id) || []).reduce(
      (sum, child) => sum + subtreeWidth(child),
      0,
    );
    visiting.delete(id);
    const width = Math.max(1, branch);
    widths.set(id, width);
    return width;
  };
  roots.forEach((root) => subtreeWidth(root.id));
  const totalWidth = Math.max(
    1,
    roots.reduce((sum, root) => sum + (widths.get(root.id) || 1), 0),
  );
  const positions = new Map<string, { x: number; y: number }>();
  const gap = 360;
  const assign = (id: string, start: number, level: number) => {
    const width = widths.get(id) || 1;
    const childIds = children.get(id) || [];
    depth.set(id, level);
    positions.set(id, {
      x: (start + width / 2 - totalWidth / 2) * gap,
      y: 70 + level * 250,
    });
    let cursor = start;
    childIds.forEach((child) => {
      const childWidth = widths.get(child) || 1;
      assign(child, cursor, level + 1);
      cursor += childWidth;
    });
  };
  let cursor = 0;
  roots.forEach((root) => {
    const width = widths.get(root.id) || 1;
    assign(root.id, cursor, 0);
    cursor += width;
  });
  return nodes.map((node) => ({
    ...node,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    position: positions.get(node.id) || { x: 0, y: 70 },
  }));
}
function canvasNodeLabel(
  id: string,
  kind: CanvasNodeKind,
  title: string,
  content: string,
  imageUrl?: string,
  color?: string,
  starred = false,
) {
  const safeLink = /^https?:\/\//i.test(content) ? content : undefined;
  return (
    <div
      className="node-content-scroll relative max-h-56 overflow-y-auto pr-1"
      onWheelCapture={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("button")) return;
        event.stopPropagation();
        window.dispatchEvent(
          new CustomEvent<CanvasNodeEditEvent>("context-flow:edit-node", {
            detail: { id, kind, title, content, imageUrl, color },
          }),
        );
      }}
    >
      <button
        type="button"
        className={`absolute right-[0.05rem] top-[0.05rem] z-[2] grid size-[1.35rem] place-items-center rounded-full text-muted opacity-45 transition-[color,opacity,background] duration-150 hover:bg-primary/10 hover:text-primary hover:opacity-100 ${starred ? "text-primary opacity-100" : ""}`}
        aria-label={starred ? "取消重要標記" : "標記為重要"}
        onClick={(event) => {
          event.stopPropagation();
          window.dispatchEvent(
            new CustomEvent<CanvasNodeStarEvent>("context-flow:toggle-star", {
              detail: { id },
            }),
          );
        }}
      >
        <Star className="size-3.5" fill={starred ? "currentColor" : "none"} />
      </button>
      <p className="break-words font-semibold">{title}</p>
      {kind === "image" && imageUrl ? (
        <img
          className="mt-2 max-h-32 w-full rounded object-cover"
          src={imageUrl}
          alt={title}
        />
      ) : kind === "link" && safeLink ? (
        <a
          className="mt-1 block break-all text-xs leading-5 text-primary underline underline-offset-2"
          href={safeLink}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </a>
      ) : (
        <div className="markdown-content mt-1 break-words text-xs leading-5 opacity-70">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
}
function normalizeMath(value: string) {
  const symbols: Record<string, string> = {
    "\\rightarrow": "→",
    "\\to": "→",
    "\\leftarrow": "←",
    "\\leftrightarrow": "↔",
    "\\times": "×",
    "\\cdot": "·",
    "\\le": "≤",
    "\\ge": "≥",
    "\\neq": "≠",
    "\\infty": "∞",
    "\\alpha": "α",
    "\\beta": "β",
    "\\gamma": "γ",
  };
  return value
    .replace(/\$([^$]+)\$/g, (_, expression: string) =>
      expression
        .replace(
          /\\[a-zA-Z]+/g,
          (command: string) => symbols[command] || command.slice(1),
        )
        .replace(/[{}]/g, ""),
    )
    .replace(
      /\\(rightarrow|to|leftarrow|leftrightarrow|times|cdot|le|ge|neq|infty|alpha|beta|gamma)/g,
      (command: string) => symbols[`\\${command.slice(1)}`] || command,
    );
}
function MiniMapToggle() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mini-map-toggle absolute bottom-3 right-3 z-10">
      <span
        className="icon-tooltip"
        data-tooltip={open ? "隱藏小地圖" : "顯示小地圖"}
      >
        <button
          type="button"
          className="relative z-10 grid size-8 place-items-center rounded-primary border border-border bg-surface/95 text-muted shadow-sm hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "隱藏小地圖" : "顯示小地圖"}
        >
          <MapIcon className="size-4" />
        </button>
      </span>
      {open && (
        <MiniMap className="absolute bottom-10! right-0! h-28! w-36! bg-surface!" />
      )}
    </div>
  );
}
function NodePreviewPanel({
  preview,
  onChange,
  onCancel,
  onCommit,
}: {
  preview: NodePreview;
  onChange: (drafts: PreviewDraft[]) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const areaName = preview.area === "zone" ? "資料架構區" : "發散思考區";
  return (
    <section
      className="mt-3 rounded-primary border border-primary/30 bg-primary/5 p-3"
      aria-label={`${areaName}節點預覽`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">節點預覽</p>
          <p className="text-xs text-muted">逐筆修改後再加入畫布</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onCancel}
          aria-label="取消預覽"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {preview.drafts.map((draft, index) => (
          <div
            key={draft.id}
            className="rounded-primary border border-border bg-surface p-3"
          >
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>節點 {index + 1}</span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() =>
                  onChange(
                    preview.drafts.filter((item) => item.id !== draft.id),
                  )
                }
              >
                移除
              </button>
            </div>
            <Input
              value={draft.title}
              onChange={(event) =>
                onChange(
                  preview.drafts.map((item) =>
                    item.id === draft.id
                      ? { ...item, title: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="節點標題"
            />
            <textarea
              value={draft.content}
              onChange={(event) =>
                onChange(
                  preview.drafts.map((item) =>
                    item.id === draft.id
                      ? { ...item, content: event.target.value }
                      : item,
                  ),
                )
              }
              className="mt-2 min-h-24 w-full resize-y rounded-primary border border-border bg-background p-2 text-sm outline-none focus:border-primary"
              placeholder="節點內容"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onCommit}
          disabled={!preview.drafts.length}
        >
          <Plus className="size-3.5" />
          加入節點至{areaName}
        </Button>
      </div>
    </section>
  );
}
function assistantToPreview(content: string) {
  let sectionParent: string | undefined;
  let conversationRoot: string | undefined;
  let previousId: string | undefined;
  const relations: NodePreview["relations"] = [];
  const segments: string[] = [];
  let paragraph: string[] = [];
  let codeBlock: string[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length) {
      segments.push(paragraph.join(" ").trim());
      paragraph = [];
    }
  };
  content.split(/\r?\n/).forEach((value) => {
    const line = value.trim();
    if (line.startsWith("```")) {
      if (codeBlock) {
        codeBlock.push(line);
        segments.push(codeBlock.join("\n"));
        codeBlock = null;
      } else {
        flushParagraph();
        codeBlock = [line];
      }
      return;
    }
    if (codeBlock) {
      codeBlock.push(line);
      return;
    }
    if (!line || /^---+$/.test(line)) {
      flushParagraph();
      return;
    }
    if (/^#{1,4}\s+/.test(line) || /^[-*•]\s+|^\d+[.)、]\s+/.test(line)) {
      flushParagraph();
      segments.push(line);
      return;
    }
    paragraph.push(line);
  });
  const trailingCodeBlock = codeBlock as string[] | null;
  if (trailingCodeBlock) segments.push(trailingCodeBlock.join("\n"));
  flushParagraph();
  const lines = segments
    .map((segment) =>
      segment
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim(),
    )
    .filter(Boolean);
  const latexLines = lines.filter(
    (line) => /^\\[a-zA-Z]+/.test(line) || /^\$\$?/.test(line),
  );
  if (
    latexLines.length >= 2 &&
    latexLines.length / Math.max(lines.length, 1) >= 0.5
  ) {
    const id = `preview-${crypto.randomUUID()}`;
    return {
      drafts: [{ id, title: "LaTeX 程式碼", content: latexLines.join("\n") }],
      relations: [] as NodePreview["relations"],
    };
  }
  const drafts: PreviewDraft[] = [];
  lines.forEach((line) => {
    const markdownHeading = line.match(/^#{1,4}\s+(.+)$/);
    const boldHeading = line.match(/^\*\*(.+?)\*\*\s*$/);
    const boldLabel = line.match(/^\*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
    // Numbered lines are list items, not headings. Treating every `1.` item as
    // a section flattens or misplaces the generated node tree.
    const isHeading = Boolean(markdownHeading || boldHeading);
    const cleaned = isHeading
      ? (markdownHeading?.[1] || boldHeading?.[1] || "").trim()
      : line
          .replace(/^[-*•]\s+/, "")
          .replace(/^\d+[.)、]\s+/, "")
          .trim();
    if (
      !cleaned ||
      /^(以下|首先|接下來|總結如下|希望這些|好的[，。]?)/.test(cleaned)
    )
      return;
    const labelled = !isHeading
      ? boldLabel
        ? { 1: boldLabel[1], 2: boldLabel[2] }
        : cleaned.match(/^([^：:]{1,18})[：:](.+)$/)
      : null;
    const id = `preview-${crypto.randomUUID()}`;
    const body = isHeading ? "" : labelled?.[2]?.trim() || cleaned;
    const inferredTitle =
      labelled?.[1]?.trim() || cleaned.split(/[。！？!?；;：:]/)[0].trim();
    const rawTitle = isHeading ? cleaned : inferredTitle;
    const fallbackTitle = (
      /^(細項|內容|說明|重點|其他)$/.test(rawTitle)
        ? body.split(/[。！？!?；;：:]/)[0].trim()
        : rawTitle
    )
      .replace(/\*{1,3}/g, "")
      .trim();
    const title =
      fallbackTitle.slice(0, 42) || `未命名主題 ${drafts.length + 1}`;
    const draft: PreviewDraft = {
      id,
      title,
      content: body.length > 160 ? `${body.slice(0, 160).trim()}…` : body,
    };
    drafts.push(draft);
    if (!conversationRoot && !isHeading && !sectionParent)
      conversationRoot = id;
    if (isHeading) {
      if (conversationRoot && conversationRoot !== previousId)
        relations.push({
          source: conversationRoot,
          target: id,
          label: "主題分支",
        });
      sectionParent = id;
      if (!conversationRoot) conversationRoot = id;
    } else if (sectionParent)
      relations.push({ source: sectionParent, target: id });
    else if (previousId) relations.push({ source: previousId, target: id });
    previousId = id;
  });
  const inbound = new Set(relations.map((relation) => relation.target));
  drafts.forEach((draft, index) => {
    if (index > 0 && !inbound.has(draft.id)) {
      relations.push({ source: drafts[index - 1].id, target: draft.id });
      inbound.add(draft.id);
    }
  });
  return { drafts, relations };
}
function convergenceToPreview(content: string) {
  const drafts: PreviewDraft[] = [];
  const relations: NodePreview["relations"] = [];
  const headingStack: Array<{ level: number; id: string }> = [];
  const draftById = new Map<string, PreviewDraft>();
  let currentId: string | undefined;
  let currentLevel = 0;
  content.split(/\r?\n/).forEach((value) => {
    const line = value.trim();
    if (!line || /^---+$/.test(line)) return;
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const bullet = line
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+[.)、]\s+/, "")
      .trim();
    const isList = bullet !== line || /^\d+[.)、]\s+/.test(line);
    const cleaned = (heading ? heading[2] : isList ? bullet : line)
      .replace(/\*{1,3}/g, "")
      .trim();
    if (
      !cleaned ||
      /^(以下|首先|接下來|總結如下|希望這些|好的[，。]?)$/.test(cleaned)
    )
      return;
    if (!heading && isList && currentId && currentLevel >= 2) {
      const parent = currentId;
      const id = `preview-${crypto.randomUUID()}`;
      const labelled = cleaned.match(/^([^：:]{1,16})[：:]\s*(.+)$/);
      const title = (labelled?.[1] || cleaned.split(/[。！？!?；;]/)[0])
        .trim()
        .slice(0, 30);
      const body = (labelled?.[2] || cleaned).trim();
      if (!body) return;
      const draft = { id, title: title || "補充說明", content: body };
      drafts.push(draft);
      draftById.set(id, draft);
      relations.push({ source: parent, target: id, label: "包含" });
      return;
    }
    if (!heading) {
      if (currentId) {
        const draft = draftById.get(currentId);
        if (draft)
          draft.content = `${draft.content}${draft.content ? "\n" : ""}• ${cleaned}`;
      } else {
        const id = `preview-${crypto.randomUUID()}`;
        const draft = { id, title: "重點整理", content: cleaned };
        drafts.push(draft);
        draftById.set(id, draft);
        currentId = id;
      }
      return;
    }
    const level = heading[1].length;
    const id = `preview-${crypto.randomUUID()}`;
    const draft = { id, title: cleaned.slice(0, 42), content: "" };
    drafts.push(draft);
    draftById.set(id, draft);
    currentId = id;
    currentLevel = level;
    while (
      headingStack.length &&
      headingStack[headingStack.length - 1].level >= level
    )
      headingStack.pop();
    const parent = headingStack[headingStack.length - 1]?.id;
    if (parent)
      relations.push({
        source: parent,
        target: id,
        label: level === 2 ? "包含路線" : "包含",
      });
    headingStack.push({ level, id });
  });
  const priority = (draft: PreviewDraft) =>
    /收斂建議|推薦路線|下一步/.test(draft.title)
      ? 2
      : /可行路線|路線\s*[A-ZＡ-Ｚ]/i.test(draft.title)
        ? 1
        : 0;
  drafts.sort((left, right) => priority(left) - priority(right));
  return { drafts, relations };
}
function colorsByPath(
  drafts: PreviewDraft[],
  relations: NodePreview["relations"],
) {
  const palette = [
    "var(--node-context)",
    "var(--node-reference)",
    "var(--node-idea)",
    "var(--node-outcome)",
    "#ffffff",
  ];
  const draftIds = new Set(drafts.map((draft) => draft.id));
  const children = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  drafts.forEach((draft) => {
    children.set(draft.id, []);
    incoming.set(draft.id, 0);
  });
  relations.forEach((relation) => {
    if (!draftIds.has(relation.source) || !draftIds.has(relation.target))
      return;
    children.get(relation.source)?.push(relation.target);
    incoming.set(relation.target, (incoming.get(relation.target) || 0) + 1);
  });
  const depth = new Map<string, number>();
  const queue = drafts
    .filter((draft) => incoming.get(draft.id) === 0)
    .map((draft) => draft.id);
  queue.forEach((id) => depth.set(id, 0));
  while (queue.length) {
    const id = queue.shift()!;
    (children.get(id) || []).forEach((child) => {
      const nextDepth = (depth.get(id) || 0) + 1;
      if (nextDepth > (depth.get(child) ?? -1)) depth.set(child, nextDepth);
      queue.push(child);
    });
  }
  const colors = new Map<string, string>();
  drafts.forEach((draft) =>
    colors.set(
      draft.id,
      draft.color || palette[(depth.get(draft.id) || 0) % palette.length],
    ),
  );
  return colors;
}
function ChatActionBar({
  onRegenerate,
  onCopy,
  onCreateNodes,
}: {
  onRegenerate: () => void;
  onCopy: () => void;
  onCreateNodes: () => void;
}) {
  return (
    <div className="chat-message-actions mt-2 flex items-center gap-1 text-[11px] text-muted">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary"
        onClick={onRegenerate}
      >
        <RefreshCw className="size-3" />
        重做
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary"
        onClick={onCopy}
      >
        <Copy className="size-3" />
        複製
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-primary hover:bg-primary/10"
        onClick={onCreateNodes}
      >
        <Plus className="size-3" />
        產生節點
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary"
        onClick={() =>
          window.dispatchEvent(new Event("context-flow:new-conversation"))
        }
      >
        新對話
      </button>
    </div>
  );
}
function EditableUserMessage({
  question,
  displayName,
  onResend,
}: {
  question: string;
  displayName: string;
  onResend?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(question);
  return (
    <div className="chat-message-shell chat-message-user">
      <div className="chat-message-role">{displayName}</div>
      {editing ? (
        <div className="chat-message-edit-box">
          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="chat-message-edit-actions">
            <button
              type="button"
              onClick={() => {
                setValue(question);
                setEditing(false);
              }}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!value.trim()}
              onClick={() => {
                setEditing(false);
                if (onResend) onResend(value.trim());
              }}
            >
              更新
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="chat-message-bubble">
            <p>{value}</p>
          </div>
          <div className="chat-message-actions chat-message-user-actions mt-2 flex items-center justify-end gap-1 text-[11px] text-muted">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-secondary"
              onClick={() => setEditing(true)}
            >
              <IconEdit className="size-3" />
              編輯
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectCanvas({ projectId }: { projectId: string }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const canvasHydrated = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const saveSequence = useRef(0);
  const saveRevision = useRef<string | null>(null);
  const saveConflict = useRef(false);
  const unsaved = useRef(false);
  const replica = useRef<CanvasReplica | null>(null);
  const replicaProject = useRef<string | null>(null);
  const [collaborationReady, setCollaborationReady] = useState(false);
  const [collaborationStatus, setCollaborationStatus] = useState<SyncState>('connecting');
  const [otherEditors, setOtherEditors] = useState(0);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "error" | "conflict"
  >("saved");
  const [saveRetry, setSaveRetry] = useState(0);
  const {
    containerRef: leftPanelRef,
    topPercent,
    beginDrag,
  } = useVerticalSplit();
  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<DataResource[]>([]);
  const [processedResourceIds, setProcessedResourceIds] = useState<string[]>(
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [convergenceSnapshot, setConvergenceSnapshot] = useState<
    Pick<CanvasSnapshot, "convergenceNodes" | "convergenceEdges">
  >({ convergenceNodes: [], convergenceEdges: [] });
  const [collapsed, setCollapsed] = useState<Record<Area, boolean>>({
    pool: false,
    zone: false,
    diverge: false,
    converge: false,
  });
  const [layout, setLayout] = useState<"row" | "column">("row");
  const [selectedNode, setSelectedNode] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [summary, setSummary] = useState("");
  const [nodePreview, setNodePreview] = useState<NodePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const conversationMessages = useRef<
    Record<string, { role: "user" | "assistant"; content: string }[]>
  >({ general: [] });
  const [structureBusy, setStructureBusy] = useState(false);
  const [convergeBusy, setConvergeBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const rightDragEdge = useRef<string | undefined>(undefined);
  const rightDragging = useRef(false);
  const rightSelectionStart = useRef<
    { x: number; y: number; scope: Element } | undefined
  >(undefined);
  const conversationHistory = useRef<Record<string, string[]>>({ general: [] });
  const lastDivergenceNode = useRef<string | undefined>(undefined);
  const replaceMessageIndex = useRef<number | undefined>(undefined);
  const activeConversation = useRef("general");
  const currentUser = useAuthStore((state) => state.user);
  const canEdit = project?.role !== "viewer" && (!project?.collaborationEnabled || collaborationReady);
  const prepareTour = useCallback(() => {
    setCollapsed({ pool: false, zone: false, diverge: false, converge: false });
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element || !canEdit) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        rightDragging.current = true;
        rightDragEdge.current = undefined;
        rightSelectionStart.current = {
          x: event.clientX,
          y: event.clientY,
          scope:
            (event.target as Element | null)?.closest(".react-flow") || element,
        };
        event.preventDefault();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!rightDragging.current) return;
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const edge = hit?.closest(".react-flow__edge");
      const id = edge?.getAttribute("data-id");
      if (id && rightDragEdge.current !== id) {
        rightDragEdge.current = id;
        setEdges((current) => current.filter((item) => item.id !== id));
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button === 2) rightDragging.current = false;
      const start = rightSelectionStart.current;
      rightSelectionStart.current = undefined;
      rightDragEdge.current = undefined;
      if (
        !start ||
        event.button !== 2 ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
      )
        return;
      const left = Math.min(start.x, event.clientX);
      const right = Math.max(start.x, event.clientX);
      const top = Math.min(start.y, event.clientY);
      const bottom = Math.max(start.y, event.clientY);
      const selected = new Set(
        Array.from(
          start.scope.querySelectorAll<HTMLElement>(".react-flow__node"),
        )
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.left >= left &&
              rect.right <= right &&
              rect.top >= top &&
              rect.bottom <= bottom
            );
          })
          .map((node) => node.getAttribute("data-id"))
          .filter((id): id is string => Boolean(id)),
      );
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: selected.has(node.id) })),
      );
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const edge = (event.target as Element | null)?.closest(
        ".react-flow__edge",
      );
      const id = edge?.getAttribute("data-id");
      if (!id) return;
      document.querySelector("[data-edge-menu]")?.remove();
      const menu = document.createElement("button");
      menu.type = "button";
      menu.dataset.edgeMenu = "true";
      menu.textContent = "刪除連線";
      Object.assign(menu.style, {
        position: "fixed",
        left: `${event.clientX + 8}px`,
        top: `${event.clientY + 8}px`,
        zIndex: "100",
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        background: "white",
        color: "var(--foreground)",
        fontSize: "12px",
        boxShadow: "0 2px 8px rgb(0 0 0 / 0.14)",
        cursor: "pointer",
      });
      menu.addEventListener("click", () => {
        window.dispatchEvent(
          new CustomEvent<EdgeEditEvent>("context-flow:delete-edge", {
            detail: { id, label: "" },
          }),
        );
        menu.remove();
      });
      document.body.appendChild(menu);
    };
    element.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    element.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      element.removeEventListener("contextmenu", onContextMenu, true);
    };
  }, [project?.id, canEdit, setNodes, setEdges]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const stopCanvasWheel = (event: WheelEvent) => {
      if ((event.target as Element | null)?.closest(".node-content-scroll"))
        event.stopPropagation();
    };
    element.addEventListener("wheel", stopCanvasWheel, true);
    return () => element.removeEventListener("wheel", stopCanvasWheel, true);
  }, [project?.id]);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const clearDivergenceSelection = (event: MouseEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest(".react-flow__pane, .canvas-grid")
      )
        return;
      if (target.closest(".react-flow__node, .react-flow__edge, button"))
        return;
      if (
        target.closest(".workspace-area")?.getAttribute("data-canvas-area") ===
        "diverge"
      )
        setSelectedNode(undefined);
    };
    host.addEventListener("click", clearDivergenceSelection, true);
    return () =>
      host.removeEventListener("click", clearDivergenceSelection, true);
  }, [project?.id]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canEdit) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (
        root.current?.querySelector(
          '.workspace-area[data-canvas-area="converge"] .react-flow__node.selected',
        )
      )
        return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      const ids = new Set(
        nodes.filter((node) => node.selected).map((node) => node.id),
      );
      if (!ids.size) return;
      event.preventDefault();
      setNodes((current) => current.filter((node) => !ids.has(node.id)));
      setEdges((current) =>
        current.filter(
          (edge) => !ids.has(edge.source) && !ids.has(edge.target),
        ),
      );
      setSelectedNode(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, nodes, setNodes, setEdges]);
  useEffect(() => {
    const clearCanvas = (event: Event) => {
      if (!canEdit) return;
      const area = (event as CustomEvent<{ area?: string }>).detail?.area;
      if (area !== "zone" && area !== "diverge") return;
      const shouldRemove = (node: Node) =>
        area === "diverge"
          ? String(node.id).startsWith("diverge-")
          : !String(node.id).startsWith("diverge-");
      setNodes((current) => {
        const removed = new Set(
          current.filter(shouldRemove).map((node) => node.id),
        );
        if (removed.size)
          setEdges((currentEdges) =>
            currentEdges.filter(
              (edge) => !removed.has(edge.source) && !removed.has(edge.target),
            ),
          );
        return current.filter((node) => !removed.has(node.id));
      });
      setSelectedNode(undefined);
    };
    window.addEventListener("context-flow:clear-canvas", clearCanvas);
    return () =>
      window.removeEventListener("context-flow:clear-canvas", clearCanvas);
  }, [canEdit, setNodes, setEdges]);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const chatForm = host
      .querySelector<HTMLFormElement>("textarea.max-h-28")
      ?.closest("form");
    const messagesPane = chatForm?.previousElementSibling;
    messagesPane?.classList.toggle("ai-thinking-messages", busy);
    host.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      const text = button.textContent || "";
      if (text.includes("建立資料架構") || text.includes("AI 收斂總結"))
        button.classList.toggle("animate-pulse", busy);
    });
  }, [busy]);
  useEffect(() => {
    const addCanvasNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEvent>).detail;
      if (!detail) return;
      if (detail.area === "converge") return;
      const id = `${detail.area}-${crypto.randomUUID()}`;
      setNodes((current) => {
        const inArea = current.filter((node) =>
          String(node.id).startsWith(`${detail.area}-`),
        ).length;
        return [
          ...current,
          {
            id,
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            position: findFreeNodePosition(
              (() => {
                const canvas = root.current?.querySelector<HTMLElement>(
                  `.workspace-area[data-canvas-area="${detail.area}"] .react-flow`,
                );
                const viewport = canvas?.querySelector<HTMLElement>(
                  ".react-flow__viewport",
                );
                const rect = canvas?.getBoundingClientRect();
                const transform = viewport?.style.transform.match(
                  /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\) scale\(([\d.]+)\)/,
                );
                if (rect && transform) {
                  const scale = Number(transform[3]) || 1;
                  const tx = Number(transform[1]) || 0;
                  const ty = Number(transform[2]) || 0;
                  return {
                    x: (rect.width / 2 - tx) / scale - 110,
                    y: (rect.height / 2 - ty) / scale - 70,
                  };
                }
                return {
                  x: 70 + (inArea % 3) * 255,
                  y: 70 + Math.floor(inArea / 3) * 180,
                };
              })(),
              current.filter((node) =>
                detail.area === "diverge"
                  ? node.id.startsWith("diverge-")
                  : !node.id.startsWith("diverge-"),
              ),
            ),
            data: {
              label: canvasNodeLabel(
                id,
                detail.kind,
                detail.title,
                detail.content,
                detail.imageUrl,
                detail.color,
              ),
              content: detail.content,
              nodeKind: detail.kind,
              nodeTitle: detail.title,
              nodeContent: detail.content,
              imageUrl: detail.imageUrl,
              nodeColor:
                detail.color ||
                (detail.area === "diverge"
                  ? "var(--node-idea)"
                  : detail.area === "converge"
                    ? "var(--node-outcome)"
                    : "var(--node-context)"),
            },
            style: {
              ...nodeStyle(
                detail.area === "diverge"
                  ? "diverge"
                  : detail.area === "converge"
                    ? "converge"
                    : detail.kind === "note"
                      ? "insight"
                      : detail.kind === "link"
                        ? "reference"
                        : "core",
              ),
              ...(detail.color
                ? {
                    background: detail.color,
                    ...(NODE_COLORS.some(
                      (color) => color.value === detail.color,
                    )
                      ? { color: "#20201e" }
                      : {}),
                  }
                : {}),
            },
          },
        ];
      });
      setSelectedNode(id);
    };
    const updateCanvasNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeUpdateEvent>).detail;
      if (!detail) return;
      setNodes((current) =>
        current.map((node) => {
          const data = node.data as Record<string, unknown>;
          if (node.id !== detail.id) return node;
          return {
            ...node,
            data: {
              ...data,
              label: canvasNodeLabel(
                node.id,
                detail.kind,
                detail.title,
                detail.content,
                detail.imageUrl,
                detail.color,
                Boolean(data.starred),
              ),
              nodeKind: detail.kind,
              nodeTitle: detail.title,
              nodeContent: detail.content,
              imageUrl: detail.imageUrl,
              nodeColor: detail.color,
            },
            style: {
              ...node.style,
              background: detail.color,
              ...(NODE_COLORS.some((color) => color.value === detail.color)
                ? { color: "#20201e" }
                : {}),
            },
          };
        }),
      );
    };
    const toggleStar = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeStarEvent>).detail;
      if (!detail?.id) return;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== detail.id) return node;
          const data = node.data as Record<string, unknown>;
          const starred = !Boolean(data.starred);
          return {
            ...node,
            data: {
              ...data,
              starred,
              label: canvasNodeLabel(
                node.id,
                (data.nodeKind as CanvasNodeKind) || "text",
                String(data.nodeTitle || "未命名節點"),
                String(data.nodeContent || ""),
                data.imageUrl as string | undefined,
                data.nodeColor as string | undefined,
                starred,
              ),
            },
          };
        }),
      );
    };
    window.addEventListener("context-flow:add-node", addCanvasNode);
    window.addEventListener("context-flow:update-node", updateCanvasNode);
    window.addEventListener("context-flow:toggle-star", toggleStar);
    return () => {
      window.removeEventListener("context-flow:add-node", addCanvasNode);
      window.removeEventListener("context-flow:update-node", updateCanvasNode);
      window.removeEventListener("context-flow:toggle-star", toggleStar);
    };
  }, [nodes, setNodes]);
  useEffect(() => {
    const updateEdge = (event: Event) => {
      const detail = (event as CustomEvent<EdgeEditEvent>).detail;
      if (
        !detail ||
        detail.area === "converge" ||
        detail.id.startsWith("converge-")
      )
        return;
      setEdges((current) =>
        current.map((edge) =>
          edge.id === detail.id
            ? { ...edge, label: detail.label || undefined }
            : edge,
        ),
      );
    };
    window.addEventListener("context-flow:update-edge", updateEdge);
    return () =>
      window.removeEventListener("context-flow:update-edge", updateEdge);
  }, [setEdges]);
  useEffect(() => {
    const deleteEdge = (event: Event) => {
      const detail = (event as CustomEvent<EdgeEditEvent>).detail;
      if (
        !detail ||
        detail.area === "converge" ||
        detail.id.startsWith("converge-")
      )
        return;
      setEdges((current) => current.filter((edge) => edge.id !== detail.id));
    };
    window.addEventListener("context-flow:delete-edge", deleteEdge);
    return () =>
      window.removeEventListener("context-flow:delete-edge", deleteEdge);
  }, [setEdges]);
  useEffect(() => {
    const connect = (event: Event) => {
      const detail = (event as CustomEvent<Connection>).detail;
      if (
        !detail ||
        String(detail.source).startsWith("converge-") ||
        String(detail.target).startsWith("converge-")
      )
        return;
      setEdges((current) =>
        addEdge(
          { ...detail, type: "default", style: { stroke: "var(--primary)" } },
          current,
        ),
      );
    };
    window.addEventListener("context-flow:connect", connect);
    return () => window.removeEventListener("context-flow:connect", connect);
  }, [setEdges]);
  useEffect(() => {
    const removeSelectedItems = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const selectedEdgeIds = Array.from(
        root.current?.querySelectorAll<SVGGElement>(
          ".react-flow__edge.selected",
        ) || [],
      )
        .map((edge) => edge.dataset.id)
        .filter((id): id is string => Boolean(id));
      const selectedNodeIds = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          ".react-flow__node.selected",
        ) || [],
      )
        .map((node) => node.dataset.id)
        .filter((id): id is string => Boolean(id));
      if (!selectedEdgeIds.length && !selectedNodeIds.length) return;
      event.preventDefault();
      if (selectedNodeIds.length)
        setNodes((current) =>
          current.filter((node) => !selectedNodeIds.includes(node.id)),
        );
      setEdges((current) =>
        current.filter(
          (edge) =>
            !selectedEdgeIds.includes(edge.id) &&
            !selectedNodeIds.includes(edge.source) &&
            !selectedNodeIds.includes(edge.target),
        ),
      );
    };
    window.addEventListener("keydown", removeSelectedItems);
    return () => window.removeEventListener("keydown", removeSelectedItems);
  }, [setEdges, setNodes]);
  useEffect(() => {
    const chat = root.current?.querySelector<HTMLElement>(
      ".min-h-0.flex-1.space-y-3.overflow-y-auto",
    );
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);
  useEffect(() => {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.forEach((button) => {
      const text = button.textContent || "";
      if (text.includes("建立資料架構")) {
        button.classList.toggle("animate-pulse", structureBusy);
        button.classList.toggle("generating-pulse", structureBusy);
      }
      if (text.includes("整理成結論")) {
        button.classList.toggle("animate-pulse", convergeBusy);
        button.classList.toggle("generating-pulse", convergeBusy);
      }
    });
  }, [structureBusy, convergeBusy]);
  useEffect(() => {
    const submitOnEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      const target = event.target;
      if (
        !(target instanceof HTMLTextAreaElement) ||
        !target.classList.contains("max-h-28")
      )
        return;
      const form = target.closest("form");
      if (!form) return;
      event.preventDefault();
      form.requestSubmit();
    };
    window.addEventListener("keydown", submitOnEnter);
    return () => window.removeEventListener("keydown", submitOnEnter);
  }, []);
  useEffect(() => {
    const editUserMessage = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const bubble = target.closest(".ml-10");
      if (!bubble) return;
      const text = bubble.querySelector("p")?.textContent?.trim();
      if (!text) return;
      setPrompt(text);
      window.setTimeout(
        () =>
          document
            .querySelector<HTMLTextAreaElement>("textarea.max-h-28")
            ?.focus(),
        0,
      );
    };
    const rootElement = root.current;
    rootElement?.addEventListener("dblclick", editUserMessage);
    return () => rootElement?.removeEventListener("dblclick", editUserMessage);
  }, [currentUser?.username, currentUser?.displayName]);
  useGSAP(
    () => {
      if (!project || !root.current) return;
      const areas = root.current.querySelectorAll(".workspace-area");
      if (!areas.length) return;
      gsap.fromTo(
        areas,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.05,
          ease: "power2.out",
        },
      );
    },
    {
      scope: root,
      dependencies: [
        project?.id,
        collapsed.pool,
        collapsed.zone,
        collapsed.diverge,
        collapsed.converge,
        layout,
      ],
      revertOnUpdate: true,
    },
  );
  useEffect(() => {
    const nextConversation = selectedNode || "general";
    if (activeConversation.current === nextConversation) return;
    conversationMessages.current[activeConversation.current] = messages;
    activeConversation.current = nextConversation;
    setMessages(conversationMessages.current[nextConversation] || []);
  }, [selectedNode, messages]);
  useEffect(() => {
    const resetConversation = () => {
      const id = activeConversation.current;
      conversationMessages.current[id] = [];
      conversationHistory.current[id] = [];
      setMessages([]);
      setNodePreview(null);
    };
    window.addEventListener("context-flow:new-conversation", resetConversation);
    return () =>
      window.removeEventListener(
        "context-flow:new-conversation",
        resetConversation,
      );
  }, []);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const enabled = !selectedNode || selectedNode.startsWith("diverge-");
    const input = host.querySelector<HTMLTextAreaElement>("textarea.max-h-28");
    const send = input
      ?.closest("form")
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (input) {
      input.disabled = false;
      input.classList.remove("cursor-not-allowed");
      input.placeholder = busy
        ? "AI 回覆生成中…"
        : enabled
          ? selectedNode
            ? "針對這個節點延伸思考…"
            : "例如：這裡有哪些假設需要驗證？"
          : "目前僅能針對發散思考節點提問";
    }
    if (send) send.disabled = !enabled || busy || !prompt.trim();
  }, [selectedNode, busy, prompt]);
  useEffect(() => {
    const hasZone = nodes.some(
      (node) => !String(node.id).startsWith("diverge-"),
    );
    const hasDivergence = nodes.some((node) =>
      String(node.id).startsWith("diverge-"),
    );
    const button = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("button") || [],
    ).find((item) => (item.textContent || "").includes("AI 收斂總結"));
    if (button) button.disabled = !hasZone || !hasDivergence || convergeBusy;
  }, [nodes, convergeBusy]);
  useEffect(() => {
    const header = root.current?.querySelector<HTMLElement>("[data-conversation-header]");
    if (!header) return;
    header.classList.add("conversation-context-header");
    const node = selectedNode
      ? nodes.find((item) => item.id === selectedNode)
      : undefined;
    header.dataset.conversationContext = node
      ? `專屬對話：${String(node.data.nodeTitle || "發散節點")}`
      : "全域對話";
  }, [project, selectedNode, nodes]);
  useEffect(() => {
    const pending = resources.some(
      (resource) => !processedResourceIds.includes(resource.id),
    );
    const previewing = nodePreview?.area === "zone";
    const button = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("button") || [],
    ).find((item) => (item.textContent || "").includes("建立資料架構"));
    if (button)
      button.disabled = !canEdit || !pending || previewing || structureBusy;
  }, [canEdit, resources, processedResourceIds, nodePreview, structureBusy]);
  useEffect(() => {
    const onConvergenceSnapshot = (event: Event) => {
      const detail = (
        event as CustomEvent<
          Pick<CanvasSnapshot, "convergenceNodes" | "convergenceEdges">
        >
      ).detail;
      if (detail) setConvergenceSnapshot(detail);
    };
    const requestHydration = () => {
      if (canvasHydrated.current)
        window.dispatchEvent(
          new CustomEvent("context-flow:hydrate-convergence", {
            detail: convergenceSnapshot,
          }),
        );
    };
    window.addEventListener(
      "context-flow:convergence-snapshot",
      onConvergenceSnapshot,
    );
    window.addEventListener(
      "context-flow:request-convergence-hydration",
      requestHydration,
    );
    return () => {
      window.removeEventListener(
        "context-flow:convergence-snapshot",
        onConvergenceSnapshot,
      );
      window.removeEventListener(
        "context-flow:request-convergence-hydration",
        requestHydration,
      );
    };
  }, [convergenceSnapshot]);
  useEffect(() => {
    let active = true;
    Promise.all([getProject(projectId), getCanvas(projectId)])
      .then(([nextProject, snapshot]) => {
        if (!active) return;
        setProject(nextProject);
        const restoredNodes = snapshot.nodes.map((node) => {
          const data = node.data || {};
          const kind = (data.nodeKind as CanvasNodeKind) || "text";
          const title = String(data.nodeTitle || "未命名節點");
          const content = String(data.nodeContent || "");
          return {
            ...node,
            data: {
              ...data,
              label: canvasNodeLabel(
                node.id,
                kind,
                title,
                content,
                data.imageUrl as string | undefined,
                data.nodeColor as string | undefined,
                Boolean(data.starred),
              ),
            },
          } as Node;
        });
        setNodes(restoredNodes);
        setEdges(snapshot.edges as Edge[]);
        setConvergenceSnapshot({
          convergenceNodes: snapshot.convergenceNodes || [],
          convergenceEdges: snapshot.convergenceEdges || [],
        });
        window.setTimeout(
          () =>
            window.dispatchEvent(
              new CustomEvent("context-flow:hydrate-convergence", {
                detail: {
                  convergenceNodes: snapshot.convergenceNodes || [],
                  convergenceEdges: snapshot.convergenceEdges || [],
                },
              }),
            ),
          0,
        );
        setResources(snapshot.resources || []);
        saveRevision.current = snapshot.updatedAt || null;
        saveConflict.current = false;
        setSummary(snapshot.summary || "");
        const restoredConversations = snapshot.conversations || { general: [] };
        conversationHistory.current = restoredConversations;
        const restoredMessages = Object.fromEntries(
          Object.entries(restoredConversations).map(([id, history]) => [
            id,
            history.map((entry, index) => ({
              role:
                index % 2 === 0 ? ("user" as const) : ("assistant" as const),
              content: entry.replace(/^(使用者|AI)：\s*/, ""),
            })),
          ]),
        );
        conversationMessages.current = restoredMessages;
        setMessages(restoredMessages.general || []);
        canvasHydrated.current = true;
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      canvasHydrated.current = false;
    };
  }, [projectId, setNodes, setEdges]);
  useEffect(() => {
    if (!project?.collaborationEnabled) return;
    let active = true;
    let disconnect: (() => void) | undefined;
    const apply = (snapshot: Snapshot) => {
      if (!active) return;
      const value = snapshot as unknown as CanvasSnapshot;
      setNodes(current => value.nodes.map(node => {
        const data = node.data || {};
        const previous = current.find(item => item.id === node.id);
        return { ...node, selected: previous?.selected, data: { ...data, label: canvasNodeLabel(node.id, (data.nodeKind as CanvasNodeKind) || 'text', String(data.nodeTitle || '未命名節點'), String(data.nodeContent || ''), data.imageUrl as string | undefined, data.nodeColor as string | undefined, Boolean(data.starred)) } } as Node;
      }));
      setEdges(value.edges as Edge[]);
      setConvergenceSnapshot({ convergenceNodes: value.convergenceNodes || [], convergenceEdges: value.convergenceEdges || [] });
      window.dispatchEvent(new CustomEvent('context-flow:hydrate-convergence', { detail: { ...value, collaboration: true } }));
      setResources(value.resources || []);
      setSummary(value.summary || '');
      conversationHistory.current = value.conversations || {};
      conversationMessages.current = Object.fromEntries(Object.entries(value.conversations || {}).map(([id, history]) => [id, history.map((entry, index) => ({ role: index % 2 === 0 ? 'user' as const : 'assistant' as const, content: entry.replace(/^(使用者|AI)：\s*/, '') }))]));
      setMessages(conversationMessages.current[activeConversation.current] || []);
    };
    void import('@/features/projects/collaboration-connection').then(({ connectCanvas }) => connectCanvas(project.id, {
      ready: doc => {
        if (!active) return;
        replica.current = new CanvasReplica(doc, apply);
        replicaProject.current = project.id;
        doc.on('update', (_update: Uint8Array, origin: unknown) => {
          if (!active || origin !== 'local') return;
          unsaved.current = true;
          setCollaborationStatus(current => current === 'offline' || current === 'error' ? current : 'syncing');
        });
        apply(readSnapshot(doc));
        setCollaborationReady(true);
      },
      status: (status, count) => {
        if (!active) return;
        setCollaborationStatus(status);
        setOtherEditors(count);
        unsaved.current = status !== 'synced';
      },
    })).then(cleanup => { if (active) disconnect = cleanup; else cleanup(); }).catch(() => { if (active) setCollaborationStatus('error'); });
    const captureNode = (event: Event) => { const detail = (event as CustomEvent<{ id: string }>).detail; if (detail) replica.current?.captureDraft(detail.id); };
    const captureEdge = (event: Event) => { const detail = (event as CustomEvent<{ id: string }>).detail; if (detail) replica.current?.captureDraft(detail.id, true); };
    const saveDraft = (event: Event) => {
      if (!replica.current || project.role === 'viewer') return;
      event.stopImmediatePropagation();
      replica.current.saveDraft((event as CustomEvent<CanvasNodeUpdateEvent & EdgeEditEvent>).detail);
    };
    window.addEventListener('context-flow:edit-node', captureNode, true);
    window.addEventListener('context-flow:open-edit-edge', captureEdge, true);
    window.addEventListener('context-flow:update-node', saveDraft, true);
    window.addEventListener('context-flow:update-edge', saveDraft, true);
    return () => {
      active = false;
      replica.current?.destroy(); replica.current = null;
      replicaProject.current = null;
      disconnect?.();
      window.removeEventListener('context-flow:edit-node', captureNode, true);
      window.removeEventListener('context-flow:open-edit-edge', captureEdge, true);
      window.removeEventListener('context-flow:update-node', saveDraft, true);
      window.removeEventListener('context-flow:update-edge', saveDraft, true);
    };
    // The room follows project identity, not selection or the current viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.collaborationEnabled]);
  useLayoutEffect(() => {
    if (!collaborationReady || !replica.current || replicaProject.current !== project?.id || project?.role === 'viewer') return;
    replica.current.publish(JSON.parse(JSON.stringify({
      nodes: nodes.map(node => ({ id: node.id, position: node.position, data: { ...node.data, label: undefined }, style: node.style })),
      edges, ...convergenceSnapshot, resources, conversations: conversationHistory.current, summary,
    })) as Snapshot);
  }, [collaborationReady, project?.id, project?.role, nodes, edges, convergenceSnapshot, resources, messages, summary]);
  useEffect(() => {
    if (!canvasHydrated.current || !project || project.role === "viewer" || project.collaborationEnabled)
      return;
    const sequence = ++saveSequence.current;
    if (saveConflict.current) return;
    unsaved.current = true;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      const serializableNodes = nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: { ...(node.data as Record<string, unknown>), label: undefined },
        style: node.style as Record<string, unknown> | undefined,
      }));
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() =>
          saveCanvas(projectId, {
            baseUpdatedAt: saveRevision.current,
            nodes: serializableNodes,
            edges: edges as Array<Record<string, unknown>>,
            convergenceNodes: convergenceSnapshot.convergenceNodes || [],
            convergenceEdges: convergenceSnapshot.convergenceEdges || [],
            resources,
            conversations: conversationHistory.current,
            summary,
          }),
        )
        .then((saved) => {
          saveRevision.current = saved.updatedAt || null;
          if (sequence === saveSequence.current) {
            unsaved.current = false;
            setSaveStatus("saved");
          }
        })
        .catch((reason) => {
          if (reason instanceof ApiError && reason.status === 409) {
            saveConflict.current = true;
            setSaveStatus("conflict");
            setError(
              "此畫布已被其他視窗更新。未儲存內容仍保留在此頁，請先複製文字或匯出 PNG，再重新載入頁面。",
            );
            return;
          }
          if (sequence === saveSequence.current) setSaveStatus("error");
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    projectId,
    project,
    saveRetry,
    nodes,
    edges,
    convergenceSnapshot,
    resources,
    messages,
    summary,
  ]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3500);
    return () => window.clearTimeout(timer);
  }, [error]);
  const toggle = (area: Area) =>
    setCollapsed((current) => ({ ...current, [area]: !current[area] }));
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            type: "default",
            style: { stroke: "var(--primary)" },
          },
          current,
        ),
      ),
    [setEdges],
  );
  function addResource(resource: DataResource) {
    if (
      resource.contentHash &&
      resources.some((item) => item.contentHash === resource.contentHash)
    ) {
      setError("此檔案內容已在資料池中，未重複加入。");
      return;
    }
    setResources((current) => [...current, resource]);
  }
  async function createStructure() {
    const pending = resources.filter(
      (resource) => !processedResourceIds.includes(resource.id),
    );
    if (!pending.length) return;
    setStructureBusy(true);
    setError("");
    try {
      const result = await generateDataZone(projectId, pending);
      setNodePreview({
        area: "zone",
        drafts: result.nodes.map((node) => ({
          id: node.id,
          title: node.label,
          content: node.description,
          kind: node.kind,
        })),
        relations: result.edges,
        resourceIds: pending.map((resource) => resource.id),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "建立資料架構失敗");
    } finally {
      setStructureBusy(false);
    }
  }
  async function askAssistant(event: React.FormEvent) {
    event.preventDefault();
    const question = prompt.trim();
    if (!question) return;
    const conversationId = selectedNode?.startsWith("diverge-")
      ? selectedNode
      : "general";
    // In a shared conversation, regeneration appends a new exchange rather than
    // truncating another user's concurrently added messages.
    const replacingIndex = project?.collaborationEnabled ? undefined : replaceMessageIndex.current;
    replaceMessageIndex.current = undefined;
    const activeNode =
      conversationId === "general"
        ? undefined
        : nodes.find((node) => node.id === conversationId);
    const nodeContext = activeNode
      ? `目前延伸的節點：${String(activeNode.data.nodeTitle || "")}\n${String(activeNode.data.nodeContent || "")}`
      : "目前是發散思考的共用對話。";
    const history = conversationHistory.current[conversationId] || [];
    const resend = (value: string) => {
      replaceMessageIndex.current = messages.length;
      setPrompt(value);
      window.setTimeout(
        () =>
          document
            .querySelector<HTMLTextAreaElement>("textarea.max-h-28")
            ?.closest("form")
            ?.requestSubmit(),
        0,
      );
    };
    const userContent = (
      <EditableUserMessage
        question={question}
        displayName={currentUser?.displayName || currentUser?.username || "你"}
        onResend={resend}
      />
    ) as unknown as string;
    const pendingMessages =
      replacingIndex === undefined
        ? [...messages, { role: "user" as const, content: userContent }]
        : [
            ...messages.slice(0, replacingIndex),
            { role: "user" as const, content: userContent },
          ];
    setMessages(pendingMessages);
    setPrompt("");
    setBusy(true);
    setError("");
    try {
      const result = await askProjectAssistant(
        projectId,
        [nodeContext, ...history.slice(-6), `使用者：${question}`].join("\n\n"),
      );
      const regenerate = () => {
        setPrompt(question);
        window.setTimeout(
          () =>
            document
              .querySelector<HTMLTextAreaElement>("textarea.max-h-28")
              ?.closest("form")
              ?.requestSubmit(),
          0,
        );
      };
      const copy = () => {
        void navigator.clipboard?.writeText(result.content);
        setError("AI 回覆已複製");
      };
      const assistantContent = (
        <div className="chat-message-shell">
          <div className="chat-message-role">AI</div>
          <div className="chat-message-bubble">
            <MarkdownMessage text={result.content} />
          </div>
          <ChatActionBar
            onRegenerate={regenerate}
            onCopy={copy}
            onCreateNodes={() =>
              addAnswerToDivergence(
                result.content,
                conversationId === "general" ? undefined : conversationId,
              )
            }
          />
        </div>
      ) as unknown as string;
      const nextMessages = [
        ...(project?.collaborationEnabled
          ? [...(conversationMessages.current[conversationId] || []), { role: 'user' as const, content: userContent }]
          : pendingMessages),
        { role: "assistant" as const, content: assistantContent },
      ];
      conversationMessages.current[conversationId] = nextMessages;
      const historyPrefix =
        replacingIndex === undefined
          ? (project?.collaborationEnabled ? conversationHistory.current[conversationId] || [] : history)
          : history.slice(0, Math.floor(replacingIndex / 2));
      conversationHistory.current[conversationId] = [
        ...historyPrefix,
        `使用者：${question}`,
        `AI：${result.content}`,
      ];
      setMessages(nextMessages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 請求失敗");
    } finally {
      setBusy(false);
    }
  }
  function addAnswerToDivergence(content: string, parent?: string) {
    if (!content) return;
    const preview = assistantToPreview(content);
    const source =
      parent ||
      lastDivergenceNode.current ||
      nodes.find((node) => String(node.id).startsWith("diverge-"))?.id;
    if (source && preview.drafts[0])
      preview.relations.unshift({
        source,
        target: preview.drafts[0].id,
        label: parent ? "延伸" : "同一對話",
      });
    setNodePreview({
      area: "diverge",
      ...preview,
      parentId: parent?.startsWith("diverge-") ? parent : undefined,
    });
  }
  function commitPreview() {
    if (!canEdit) {
      setError("此專案為唯讀，無法新增節點");
      return;
    }
    if (!nodePreview?.drafts.length) return;
    const colors = colorsByPath(nodePreview.drafts, nodePreview.relations);
    const ids = new Map(
      nodePreview.drafts.map((draft) => [
        draft.id,
        `${nodePreview.area === "zone" ? "ai" : "diverge"}-${crypto.randomUUID()}`,
      ]),
    );
    const created = nodePreview.drafts.map((draft, index) => {
      const id = ids.get(draft.id)!;
      const color = colors.get(draft.id) || "var(--node-context)";
      return {
        id,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        position: {
          x: 80 + (index % 3) * AUTO_LAYOUT_COLUMN_GAP,
          y: 70 + Math.floor(index / 3) * AUTO_LAYOUT_ROW_GAP,
        },
        data: {
          label: canvasNodeLabel(
            id,
            "text",
            draft.title || "未命名節點",
            draft.content,
          ),
          nodeKind: "text",
          nodeTitle: draft.title || "未命名節點",
          nodeContent: draft.content,
          nodeColor: color,
          aiGenerated: true,
        },
        style: {
          ...nodeStyle(
            nodePreview.area === "diverge"
              ? "diverge"
              : draft.kind === "reference"
                ? "reference"
                : draft.kind === "insight"
                  ? "insight"
                  : "core",
          ),
          background: color,
        },
      };
    });
    const createdEdges = nodePreview.relations.flatMap((relation) => {
      const source =
        ids.get(relation.source) ||
        (relation.source.startsWith("diverge-") ? relation.source : undefined);
      const target = ids.get(relation.target);
      return source && target
        ? [
            {
              id: `${nodePreview.area}-edge-${crypto.randomUUID()}`,
              source,
              target,
              ...(relation.label ? { label: relation.label } : {}),
              type: "bezier" as const,
              style: { stroke: "var(--primary)" },
              labelStyle: { fill: "var(--muted)", fontSize: 11 },
            },
          ]
        : [];
    });
    let positioned =
      nodePreview.area === "diverge"
        ? layoutDivergence(created, createdEdges)
        : layoutGraph(created, createdEdges);
    if (nodePreview.area === "diverge" && nodePreview.parentId) {
      const parent = nodes.find((node) => node.id === nodePreview.parentId);
      const first = positioned[0];
      if (parent && first) {
        const dx = parent.position.x - first.position.x;
        const dy = parent.position.y + AUTO_LAYOUT_ROW_GAP - first.position.y;
        positioned = positioned.map((node) => ({
          ...node,
          position: { x: node.position.x + dx, y: node.position.y + dy },
        }));
      }
    }
    setNodes((current) => [...current, ...positioned]);
    setEdges((current) => [...current, ...createdEdges]);
    if (nodePreview.area === "zone") {
      setProcessedResourceIds((current) => [
        ...current,
        ...(nodePreview.resourceIds || []),
      ]);
    } else {
      lastDivergenceNode.current = created[created.length - 1].id;
    }
    setNodePreview(null);
  }
  function autoLayout(event?: React.MouseEvent<HTMLButtonElement>) {
    const section =
      event?.currentTarget.closest<HTMLElement>(".workspace-area");
    const area = section?.dataset.canvasArea as Area | undefined;
    if (!area || area === "pool") return;
    if (area === "converge") {
      window.dispatchEvent(new Event("context-flow:layout-converge"));
      return;
    }
    const prefix = `${area}-`;
    const scopedNodes = nodes.filter(
      (node) =>
        String(node.id).startsWith(prefix) ||
        (area === "zone" && String(node.id).startsWith("ai-")),
    );
    const scopedIds = new Set(scopedNodes.map((node) => node.id));
    const scopedEdges = edges.filter(
      (edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target),
    );
    setNodes((current) => [
      ...current.filter((node) => !scopedIds.has(node.id)),
      ...layoutGraph(scopedNodes, scopedEdges),
    ]);
  }
  async function converge() {
    if (!canEdit) return;
    setConvergeBusy(true);
    setError("");
    try {
      const instruction = buildConvergencePrompt(nodes, edges);
      const result = await askProjectAssistant(projectId, instruction);
      setSummary(result.content);
      window.dispatchEvent(
        new CustomEvent("context-flow:add-convergence-result", {
          detail: { content: result.content },
        }),
      );
      setCollapsed((current) => ({ ...current, converge: false }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法產生總結");
    } finally {
      setConvergeBusy(false);
    }
  }
  async function exportCanvas(format: "pdf" | "png") {
    if (!root.current || !project || exportBusy) return;
    setError("");
    setExportNotice("");
    setExportBusy(true);
    try {
      if (collapsed.zone || collapsed.diverge || collapsed.converge)
        throw new Error("請先展開三個畫布區域，再匯出完整內容");
      const result =
        format === "pdf"
          ? await exportProjectPdf(root.current, project)
          : await exportProjectPng(root.current, project);
      if (result.warnings.length)
        setExportNotice(
          "已完成匯出；部分圖片無法載入，已在檔案中標示。請重新上傳原圖。",
        );
    } catch (reason) {
      console.error(`[ContextFlow export:${format}]`, reason);
      setError(exportErrorMessage(reason));
    } finally {
      setExportBusy(false);
    }
  }
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  if (!project)
    return <div className="p-8 text-destructive">{error || "找不到專案"}</div>;
  return (
    <div
      ref={root}
      data-project-canvas
      className="flex h-screen min-h-[80rem] flex-col bg-background lg:min-h-176"
    >
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/workspaces")}
          aria-label="返回工作區"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-20 flex-1">
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <p className="truncate text-xs text-muted">
            {project.description || "專案工作區"}
          </p>
        </div>
        <ProductTour key={project.id} stage="canvas" readOnly={!canEdit} onBeforeStart={prepareTour} />
        <Badge>{project.role}</Badge>
        {project.canvasBackupEnabled && (project.role === 'owner' || project.role === 'admin') && <CanvasBackups key={`backups-${project.id}`} projectId={project.id} synced={collaborationStatus === 'synced'} />}
        {project.collaborationEnabled && <span role="status" data-tour="canvas-save" data-collaboration-status={collaborationStatus} className="text-xs text-muted" aria-live="polite">
          {collaborationStatus === 'synced' ? `已同步 · ${otherEditors + 1} 人在線` : collaborationStatus === 'syncing' ? '同步中…' : collaborationStatus === 'offline' ? '連線中斷，重連後自動合併；請勿關閉此頁' : collaborationStatus === 'error' ? '共編連線失敗，請保留此頁並檢查連線' : '正在連接共編…'}
        </span>}
        {project.role !== "viewer" && !project.collaborationEnabled && (
          <span data-tour="canvas-save" role="status" className="text-xs text-muted" aria-live="polite">
            {saveStatus === "saving" ? (
              "儲存中…"
            ) : saveStatus === "conflict" ? (
              <button
                className="text-destructive underline"
                onClick={() => window.location.reload()}
              >
                更新衝突，請先備份未儲存內容再重載
              </button>
            ) : saveStatus === "error" ? (
              <button
                className="text-destructive underline"
                onClick={() => setSaveRetry((value) => value + 1)}
              >
                儲存失敗，點此重試
              </button>
            ) : (
              "已儲存"
            )}
          </span>
        )}
        <div data-tour="canvas-export" className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="icon-tooltip"
            data-export-icon="pdf"
            data-tooltip="匯出 PDF"
            aria-label="匯出 PDF"
            disabled={exportBusy}
            onClick={() => void exportCanvas("pdf")}
          >
            PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="icon-tooltip"
            data-export-icon="png"
            data-tooltip="匯出 PNG（分區圖片 ZIP）"
            aria-label="匯出 PNG"
            disabled={exportBusy}
            onClick={() => void exportCanvas("png")}
          />
          {exportBusy && (
            <span role="status" className="text-xs text-muted">
              正在分區匯出…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-primary border border-border p-1">
          <Button
            size="sm"
            variant={layout === "row" ? "default" : "ghost"}
            onClick={() => setLayout("row")}
            aria-label="橫式布局"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            size="sm"
            variant={layout === "column" ? "default" : "ghost"}
            onClick={() => setLayout("column")}
            aria-label="直式布局"
          >
            <span className="text-xs">↕</span>
          </Button>
        </div>
      </header>
      {exportNotice && !error && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-xs rounded-primary border border-border bg-surface px-4 py-3 text-sm text-foreground shadow-md"
        >
          {exportNotice}
        </div>
      )}
      {error && (
        <div
          className="fixed bottom-5 right-5 z-50 max-w-xs rounded-primary border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-foreground shadow-md backdrop-blur-sm"
          role="alert"
        >
          <span className="mr-2 inline-block size-2 rounded-full bg-primary align-middle" />
          {error}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden bg-border lg:flex-row">
        <section
          className={`workspace-area flex min-h-0 flex-col bg-surface ${collapsed.pool ? "lg:w-20 lg:flex-none" : "lg:w-88 lg:shrink-0"}`}
        >
          <AreaHeader
            title="資料池與 AI 助理"
            icon={<Bot className="size-4" />}
            collapsed={collapsed.pool}
            onToggle={() => toggle("pool")}
            left
          />
          {!collapsed.pool && (
            <div
              ref={leftPanelRef}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div
                className="min-h-0 overflow-y-auto p-3"
                style={{ height: `${topPercent}%` }}
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <span className="grid size-6 place-items-center rounded-primary bg-primary/20 text-primary">
                    <FileText className="size-3.5" />
                  </span>
                  <span>資料池</span>
                </div>
                {canEdit && (
                  <ResourceComposer projectId={projectId} onAdd={addResource} />
                )}
                <div className="mt-3 space-y-2">
                  {resources.map((resource) => (
                    <ResourceItem
                      key={resource.id}
                      resource={resource}
                      canRemove={canEdit}
                      onRemove={() =>
                        setResources((current) =>
                          current.filter((item) => item.id !== resource.id),
                        )
                      }
                    />
                  ))}
                </div>
                {nodePreview?.area === "zone" && (
                  <NodePreviewPanel
                    preview={nodePreview}
                    onChange={(drafts) =>
                      setNodePreview({ ...nodePreview, drafts })
                    }
                    onCancel={() => setNodePreview(null)}
                    onCommit={commitPreview}
                  />
                )}
                <Button
                  onClick={createStructure}
                  disabled={!canEdit || !resources.length || busy}
                  className="mt-3 w-full"
                >
                  <Sparkles className="size-4" />
                  建立資料架構
                </Button>
              </div>
              <button
                type="button"
                onPointerDown={beginDrag}
                className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center bg-surface"
                aria-label="拖曳調整資料池與 AI 助理高度"
                data-export-exclude
              >
                <span className="h-1 w-12 rounded-full bg-border group-hover:bg-primary" />
              </button>
              <div
                data-export-exclude
                data-tour="assistant"
                className="flex min-h-0 flex-1 flex-col border-t border-border bg-background"
              >
                <div data-conversation-header className="mb-3 flex items-center gap-2 px-3 pt-3 text-sm font-semibold">
                  <span className="grid size-6 place-items-center rounded-primary bg-primary/20 text-primary">
                    <MessageCircle className="size-3.5" />
                  </span>
                  <span>思考夥伴</span>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                  {messages.length === 0 ? (
                    <p className="px-1 py-6 text-sm text-muted">輸入問題開始對話。</p>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        key={index}
                        className={
                          message.role === "user"
                            ? "ml-10 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-surface"
                            : "mr-8 rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-sm leading-6"
                        }
                      >
                        {message.content}
                      </div>
                    ))
                  )}
                  {nodePreview?.area === "diverge" && (
                    <NodePreviewPanel
                      preview={nodePreview}
                      onChange={(drafts) =>
                        setNodePreview({ ...nodePreview, drafts })
                      }
                      onCancel={() => setNodePreview(null)}
                      onCommit={commitPreview}
                    />
                  )}
                </div>
                <form
                  onSubmit={askAssistant}
                  className="border-t border-primary/15 bg-surface/95 p-3"
                >
                  <div className="flex items-end gap-2 rounded-primary border border-primary/20 bg-primary/5 p-2 focus-within:ring-2 focus-within:ring-primary/20">
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
                      placeholder={
                        selectedNode
                          ? "針對這個節點延伸思考…"
                          : "例如：這裡有哪些假設需要驗證？"
                      }
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="shrink-0 rounded-full"
                      disabled={busy || !prompt.trim()}
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
        <div
          className="grid min-h-0 min-w-0 flex-1 gap-px bg-border"
          style={{
            gridTemplateColumns:
              layout === "row"
                ? `minmax(0, ${collapsed.zone ? "5rem" : "1fr"}) minmax(0, ${collapsed.diverge ? "5rem" : "1fr"}) minmax(0, ${collapsed.converge ? "5rem" : "1fr"})`
                : undefined,
            gridTemplateRows:
              layout === "column"
                ? `minmax(0, ${collapsed.zone ? "5rem" : "1fr"}) minmax(0, ${collapsed.diverge ? "5rem" : "1fr"}) minmax(0, ${collapsed.converge ? "5rem" : "1fr"})`
                : undefined,
          }}
        >
          <CanvasArea
            title="資料架構區"
            area="zone"
            editable={canEdit}
            icon={<Sparkles className="size-4" />}
            collapsed={collapsed.zone}
            onToggle={() => toggle("zone")}
            action={
              canEdit ? (
                <Button size="sm" variant="ghost" onClick={autoLayout}>
                  自動排版
                </Button>
              ) : undefined
            }
          >
            <div className="relative min-h-0 flex-1 canvas-grid">
              <ReactFlow
                nodes={nodes.filter(
                  (node) => !String(node.id).startsWith("diverge-"),
                )}
                edges={edges.filter(
                  (edge) => !String(edge.target).startsWith("diverge-"),
                )}
                onNodesChange={canEdit ? onNodesChange : undefined}
                onEdgesChange={canEdit ? onEdgesChange : undefined}
                onConnect={canEdit ? onConnect : undefined}
                onNodeClick={(_, node) => setSelectedNode(node.id)}
                nodesDraggable={canEdit}
                nodesConnectable={canEdit}
                fitView
              >
                <Background gap={18} size={1} color="var(--border)" />
                <Controls showInteractive={canEdit} />
                <MiniMap className="!bg-surface" />
              </ReactFlow>
              {!nodes.some(
                (node) => !String(node.id).startsWith("diverge-"),
              ) && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <p className="rounded-primary border border-border bg-surface p-4 text-center text-sm text-muted">
                    從資料池建立核心架構節點
                  </p>
                </div>
              )}
            </div>
          </CanvasArea>
          <CanvasArea
            title="發散思考區"
            area="diverge"
            editable={canEdit}
            icon={<Bot className="size-4" />}
            collapsed={collapsed.diverge}
            onToggle={() => toggle("diverge")}
            action={
              canEdit ? (
                <Button size="sm" variant="ghost" onClick={autoLayout}>
                  自動排版
                </Button>
              ) : undefined
            }
          >
            <div className="relative flex min-h-0 flex-1 flex-col canvas-grid">
              <ReactFlow
                nodes={nodes.filter((node) =>
                  String(node.id).startsWith("diverge-"),
                )}
                edges={edges.filter((edge) =>
                  String(edge.target).startsWith("diverge-"),
                )}
                onNodesChange={canEdit ? onNodesChange : undefined}
                onEdgesChange={canEdit ? onEdgesChange : undefined}
                onNodeClick={(_, node) => setSelectedNode(node.id)}
                onPaneClick={() => setSelectedNode(undefined)}
                nodesDraggable={canEdit}
                fitView
              >
                <Background gap={18} size={1} color="var(--border)" />
                <Controls showInteractive={canEdit} />
              </ReactFlow>
              {!nodes.some((node) =>
                String(node.id).startsWith("diverge-"),
              ) && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <p className="rounded-primary border border-dashed border-border bg-surface p-4 text-center text-sm text-muted">
                    從 AI 對話加入想法節點
                  </p>
                </div>
              )}
            </div>
          </CanvasArea>
          <CanvasArea
            title="收斂總結區"
            area="converge"
            editable={canEdit}
            icon={<Sparkles className="size-4" />}
            collapsed={collapsed.converge}
            onToggle={() => toggle("converge")}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
              <div className="rounded-primary border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted">
                <p className="font-semibold text-foreground">收斂的用途</p>
                <p className="mt-1">
                  主要依據發散思考的完整節點與連線；資料架構僅作背景。每條路線需標示來源，再提出決策與下一步。
                </p>
              </div>
              <div className="flex-1 rounded-primary border border-border bg-surface p-4 text-sm leading-7">
                {summary ||
                  "以發散思考節點為主要依據，參考資料架構的背景與限制；歸納路線、標示來源，再提出建議。"}
              </div>
              <Button
                onClick={converge}
                disabled={
                  !canEdit || busy || (!resources.length && !nodes.length)
                }
              >
                <Sparkles className="size-4" />
                整理成結論
              </Button>
            </div>
          </CanvasArea>
        </div>
      </div>
    </div>
  );
}
function AreaHeader({
  title,
  icon,
  collapsed,
  onToggle,
  left,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  left?: boolean;
  action?: React.ReactNode;
}) {
  const visualIcon =
    title === "資料架構區" ? <Link2 className="size-4" /> : icon;
  const toggleLabel = collapsed ? `展開${title}` : `收合${title}`;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <span className="grid size-7 place-items-center rounded-primary bg-primary/20 text-primary">
        {visualIcon}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
      )}
      {!collapsed && action}
      <span className="icon-tooltip" data-tooltip={toggleLabel}>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-8"
          onClick={onToggle}
          aria-label={toggleLabel}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : left ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelRightClose className="size-4" />
          )}
        </Button>
      </span>
    </header>
  );
}
function CanvasArea({
  title,
  area: nodeArea,
  icon,
  collapsed,
  onToggle,
  action,
  children,
  editable = true,
}: {
  title: string;
  area: 'zone' | 'diverge' | 'converge';
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
  editable?: boolean;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const areaAction =
    action ||
    (nodeArea === "converge" ? (
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          window.dispatchEvent(new Event("context-flow:layout-converge"))
        }
      >
        自動排版
      </Button>
    ) : undefined);
  const clearCanvas = () => {
    if (nodeArea) setConfirmingClear(true);
  };
  const confirmClear = () => {
    if (nodeArea)
      window.dispatchEvent(
        new CustomEvent("context-flow:clear-canvas", {
          detail: { area: nodeArea },
        }),
      );
    setConfirmingClear(false);
  };
  const compactAction = (
    <div className="flex items-center gap-1">
      {nodeArea && (
        <span className="icon-tooltip" data-tooltip={`清除${title}`}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={clearCanvas}
            aria-label={`清除${title}`}
          >
            <Trash className="size-4" />
          </Button>
        </span>
      )}
      {areaAction && isValidElement(areaAction)
        ? (() => {
            const element = areaAction as React.ReactElement<
              Record<string, unknown>
            >;
            const iconButton = cloneElement(
              element,
              {
                className: `${typeof element.props.className === "string" ? element.props.className : ""} auto-layout-icon-button`,
                "aria-label": "自動排版",
              },
              <LayoutGrid className="size-4" />,
            );
            return (
              <span className="icon-tooltip" data-tooltip="自動排版">
                {iconButton}
              </span>
            );
          })()
        : areaAction}
    </div>
  );
  const clearDialog = confirmingClear ? (
    <div
      className="fixed inset-0 z-70 grid place-items-center bg-foreground/20 p-4"
      role="presentation"
      onMouseDown={() => setConfirmingClear(false)}
    >
      <div
        className="w-full max-w-sm rounded-primary border border-border bg-surface p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`clear-${nodeArea}-title`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p id={`clear-${nodeArea}-title`} className="text-sm font-semibold">
          清除{title}？
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          這會刪除目前區域的所有節點與連線，且無法復原。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmingClear(false)}
          >
            取消
          </Button>
          <Button type="button" onClick={confirmClear}>
            確定清除
          </Button>
        </div>
      </div>
    </div>
  ) : null;
  return (
    <>
      <section
        data-canvas-area={nodeArea}
        data-readonly={!editable}
        onDoubleClickCapture={
          !editable ? (event) => event.stopPropagation() : undefined
        }
        className="workspace-area flex min-h-0 min-w-0 overflow-hidden bg-surface"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AreaHeader
            title={title}
            icon={icon}
            collapsed={collapsed}
            onToggle={onToggle}
            action={editable ? compactAction : undefined}
          />
          {nodeArea && editable && <NodeEditor area={nodeArea} />}
          {nodeArea === "converge" && editable && <EdgeEditor />}
          {!collapsed && (
            <>
              {nodeArea && editable && <NodeToolbar area={nodeArea} />}
              {nodeArea === "converge" && (
                <ConvergenceNodeLayer editable={editable} />
              )}
              {children}
            </>
          )}
        </div>
      </section>
      {typeof document !== "undefined" && clearDialog
        ? createPortal(clearDialog, document.body)
        : null}
    </>
  );
}

function NodeEditor({ area }: { area: "zone" | "diverge" | "converge" }) {
  const [draft, setDraft] = useState<
    | (CanvasNodeEditEvent & {
        color: string;
        area?: "zone" | "diverge" | "converge";
        mode: "create" | "edit";
      })
    | null
  >(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageSequence = useRef(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    const openEdit = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEditEvent>).detail;
      const belongsToArea =
        area === "diverge"
          ? detail?.id.startsWith("diverge-")
          : area === "converge"
            ? detail?.id.startsWith("converge-")
            : detail
              ? !detail.id.startsWith("diverge-") &&
                !detail.id.startsWith("converge-")
              : false;
      if (detail && belongsToArea) {
        imageSequence.current++;
        setImageLoading(false);
        setImageError("");
        setDraft({
          ...detail,
          title:
            detail.title === "文字節點" || detail.title === "連結標題"
              ? ""
              : detail.title,
          content:
            detail.content === "輸入你的想法…" ||
            detail.content.startsWith("貼上網址")
              ? ""
              : detail.content,
          mode: "edit",
          color: detail.color || NODE_COLORS[0].value,
        });
      }
    };
    const openCreate = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeDialogEvent>).detail;
      if (detail && detail.area === area) {
        imageSequence.current++;
        setImageLoading(false);
        setImageError("");
        setDraft({
          ...detail,
          id: "",
          mode: "create",
          color: NODE_COLORS[0].value,
        });
      }
    };
    window.addEventListener("context-flow:edit-node", openEdit);
    window.addEventListener("context-flow:open-create-node", openCreate);
    return () => {
      window.removeEventListener("context-flow:edit-node", openEdit);
      window.removeEventListener("context-flow:open-create-node", openCreate);
    };
  }, [area]);
  if (!draft) return null;
  const setImageFile = async (file?: File) => {
    if (!file) return;
    const sequence = ++imageSequence.current;
    setImageLoading(true);
    setImageError("");
    try {
      const imageUrl = await readImageData(file);
      if (sequence !== imageSequence.current) return;
      setDraft((current) =>
        current
          ? {
              ...current,
              title: current.title || file.name.replace(/\.[^.]+$/, ""),
              imageUrl,
            }
          : null,
      );
    } catch (reason) {
      if (sequence === imageSequence.current)
        setImageError(exportErrorMessage(reason));
    } finally {
      if (sequence === imageSequence.current) setImageLoading(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center bg-foreground/15 p-4"
      onMouseDown={() => setDraft(null)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={draft.mode === "create" ? "新增節點" : "編輯節點"}
        className="w-full max-w-md rounded-primary border border-border bg-surface p-5 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (imageLoading || imageError) return;
          if (draft.mode === "create" && draft.area)
            window.dispatchEvent(
              new CustomEvent<CanvasNodeEvent>("context-flow:add-node", {
                detail: {
                  area: draft.area,
                  kind: draft.kind,
                  title: draft.title.trim() || "未命名節點",
                  content: draft.content.trim(),
                  imageUrl: draft.imageUrl,
                  color: draft.color,
                },
              }),
            );
          else
            window.dispatchEvent(
              new CustomEvent<CanvasNodeUpdateEvent>(
                "context-flow:update-node",
                { detail: draft },
              ),
            );
          setDraft(null);
        }}
      >
        <div className="mb-4">
          <p className="text-sm font-semibold">
            {draft.mode === "create" ? "新增節點" : "編輯節點"}
          </p>
        </div>
        <label className="mb-3 block text-xs font-medium">
          標題
          <Input
            className="mt-1"
            autoFocus
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </label>
        {draft.kind === "image" && (
          <div className="mb-3 space-y-2">
            <label className="block text-xs font-medium">
              圖片連結
              <Input
                className="mt-1"
                disabled={imageLoading}
                value={draft.imageUrl || ""}
                onChange={(event) => {
                  setImageError("");
                  setDraft({ ...draft, imageUrl: event.target.value });
                }}
                placeholder="https://…"
              />
            </label>
            <label
              className="grid min-h-28 cursor-pointer place-items-center rounded-primary border border-dashed border-primary/40 bg-primary/5 text-center text-xs text-muted transition-colors hover:border-primary hover:bg-primary/10"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void setImageFile(event.dataTransfer.files[0]);
              }}
            >
              <div>
                <Upload className="mx-auto mb-1 size-5 text-primary" />
                <p>拖曳本機圖片到這裡</p>
                <p className="mt-1 text-[11px]">或點擊選擇圖片</p>
              </div>
              <input
                ref={imageInput}
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void setImageFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {imageLoading && (
              <p role="status" className="text-xs text-muted">
                正在讀取圖片…
              </p>
            )}
            {imageError && (
              <p role="alert" className="text-xs text-destructive">
                {imageError}
              </p>
            )}
            {draft.imageUrl && (
              <img
                className="max-h-32 w-full rounded-primary border border-border object-cover"
                src={draft.imageUrl}
                alt="圖片預覽"
              />
            )}
          </div>
        )}
        <div className="mb-4 text-xs font-medium">
          <label htmlFor={`${area}-node-content`}>
            {draft.kind === "link" ? "連結網址" : "內容"}
          </label>
          <textarea
            id={`${area}-node-content`}
            className="mt-1 min-h-28 w-full resize-y rounded-primary border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            value={draft.content}
            onChange={(event) =>
              setDraft({ ...draft, content: event.target.value })
            }
            placeholder={draft.kind === "link" ? "https://…" : undefined}
          />
        </div>
        <NodeColorPicker
          value={draft.color}
          onChange={(color) => setDraft({ ...draft, color })}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
            取消
          </Button>
          <Button type="submit" disabled={imageLoading || Boolean(imageError)}>
            {draft.mode === "create" ? "新增節點" : "儲存變更"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function EdgeEditor() {
  const [draft, setDraft] = useState<EdgeEditEvent | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<EdgeEditEvent>).detail;
      if (detail) setDraft({ ...detail, label: detail.label || "" });
    };
    window.addEventListener("context-flow:open-edit-edge", open);
    return () =>
      window.removeEventListener("context-flow:open-edit-edge", open);
  }, []);
  if (!draft) return null;
  return typeof document === "undefined"
    ? null
    : createPortal(
        <div
          className="fixed inset-0 z-60 grid place-items-center bg-foreground/15 p-4"
          onMouseDown={() => setDraft(null)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label="編輯連線文字"
            className="w-full max-w-md rounded-primary border border-border bg-surface p-5 shadow-lg"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              window.dispatchEvent(
                new CustomEvent<EdgeEditEvent>("context-flow:update-edge", {
                  detail: { ...draft, label: draft.label.trim() },
                }),
              );
              setDraft(null);
            }}
          >
            <div className="mb-4">
              <p className="text-sm font-semibold">編輯連線文字</p>
              <p className="mt-1 text-xs text-muted">
                可輸入關係名稱，也可以留空隱藏文字。
              </p>
            </div>
            <label className="mb-4 block text-xs font-medium">
              連線文字
              <Input
                className="mt-1"
                autoFocus
                value={draft.label}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
                placeholder="例如：包含、依賴、延伸"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDraft(null)}
              >
                取消
              </Button>
              <Button type="submit">儲存變更</Button>
            </div>
          </form>
        </div>,
        document.body,
      );
}

function NodeToolbar({ area }: { area: "zone" | "diverge" | "converge" }) {
  const openCreate = (kind: CanvasNodeKind) =>
    window.dispatchEvent(
      new CustomEvent<CanvasNodeDialogEvent>("context-flow:open-create-node", {
        detail: {
          mode: "create",
          area,
          kind,
          title: "",
          content: "",
          imageUrl: "",
        },
      }),
    );
  return (
    <div
      data-tour={`node-toolbar-${area}`}
      data-export-exclude
      className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-3 py-2"
    >
      <span className="mr-1 text-[11px] text-muted">新增節點</span>
      <ToolbarIcon label="文字節點" onClick={() => openCreate("text")}>
        <FileText className="size-4" />
      </ToolbarIcon>
      <ToolbarIcon label="連結節點" onClick={() => openCreate("link")}>
        <Link2 className="size-4" />
      </ToolbarIcon>
      <ToolbarIcon label="圖片節點" onClick={() => openCreate("image")}>
        <ImageIcon className="size-4" />
      </ToolbarIcon>
    </div>
  );
}

function ConvergenceNodeLayer({ editable = true }: { editable?: boolean }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const hydrated = useRef(false);
  useEffect(() => {
    const hydrate = (event: Event) => {
      const detail = (
        event as CustomEvent<
          Pick<CanvasSnapshot, "convergenceNodes" | "convergenceEdges">
        >
      ).detail;
      if (!detail || (hydrated.current && !(detail as typeof detail & { collaboration?: boolean }).collaboration)) return;
      const restored = (detail.convergenceNodes || []).map((node) => {
        const data = node.data || {};
        const kind = (data.nodeKind as CanvasNodeKind) || "text";
        return {
          ...node,
          data: {
            ...data,
            label: canvasNodeLabel(
              node.id,
              kind,
              String(data.nodeTitle || "未命名節點"),
              String(data.nodeContent || ""),
              data.imageUrl as string | undefined,
              data.nodeColor as string | undefined,
              Boolean(data.starred),
            ),
          },
        } as Node;
      });
      setNodes(restored);
      setEdges((detail.convergenceEdges || []) as Edge[]);
      hydrated.current = true;
    };
    window.addEventListener("context-flow:hydrate-convergence", hydrate);
    window.dispatchEvent(
      new Event("context-flow:request-convergence-hydration"),
    );
    return () =>
      window.removeEventListener("context-flow:hydrate-convergence", hydrate);
  }, [setNodes, setEdges]);
  useEffect(() => {
    if (!hydrated.current) return;
    const serializableNodes = nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: { ...(node.data as Record<string, unknown>), label: undefined },
      style: node.style as Record<string, unknown> | undefined,
    }));
    window.dispatchEvent(
      new CustomEvent("context-flow:convergence-snapshot", {
        detail: {
          convergenceNodes: serializableNodes,
          convergenceEdges: edges as Array<Record<string, unknown>>,
        },
      }),
    );
  }, [nodes, edges]);
  useEffect(() => {
    const addNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeEvent>).detail;
      if (!detail || detail.area !== "converge") return;
      const id = `converge-${crypto.randomUUID()}`;
      setNodes((current) => [
        ...current,
        {
          id,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          position: findFreeNodePosition(
            (() => {
              const canvas = document.querySelector<HTMLElement>(
                '.workspace-area[data-canvas-area="converge"] .react-flow',
              );
              const viewport = canvas?.querySelector<HTMLElement>(
                ".react-flow__viewport",
              );
              const rect = canvas?.getBoundingClientRect();
              const transform = viewport?.style.transform.match(
                /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\) scale\(([\d.]+)\)/,
              );
              if (rect && transform) {
                const scale = Number(transform[3]) || 1;
                return {
                  x:
                    (rect.width / 2 - (Number(transform[1]) || 0)) / scale -
                    110,
                  y:
                    (rect.height / 2 - (Number(transform[2]) || 0)) / scale -
                    70,
                };
              }
              return {
                x: 80 + (current.length % 3) * 250,
                y: 70 + Math.floor(current.length / 3) * 180,
              };
            })(),
            current,
            280,
          ),
          data: {
            label: canvasNodeLabel(
              id,
              detail.kind,
              detail.title,
              detail.content,
              detail.imageUrl,
              detail.color,
            ),
            nodeKind: detail.kind,
            nodeTitle: detail.title,
            nodeContent: detail.content,
            imageUrl: detail.imageUrl,
            nodeColor: detail.color || "var(--node-outcome)",
            starred: false,
          },
          style: {
            ...nodeStyle("converge"),
            width: 280,
            ...(detail.color
              ? {
                  background: detail.color,
                  ...(NODE_COLORS.some((color) => color.value === detail.color)
                    ? { color: "#20201e" }
                    : {}),
                }
              : {}),
          },
        },
      ]);
    };
    const updateNode = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeUpdateEvent>).detail;
      if (!detail || !detail.id.startsWith("converge-")) return;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== detail.id) return node;
          const data = node.data as Record<string, unknown>;
          return {
            ...node,
            data: {
              ...data,
              label: canvasNodeLabel(
                node.id,
                detail.kind,
                detail.title,
                detail.content,
                detail.imageUrl,
                detail.color,
                Boolean(data.starred),
              ),
              nodeKind: detail.kind,
              nodeTitle: detail.title,
              nodeContent: detail.content,
              nodeColor: detail.color,
              imageUrl: detail.imageUrl,
            },
            style: {
              ...node.style,
              background: detail.color,
              ...(NODE_COLORS.some((color) => color.value === detail.color)
                ? { color: "#20201e" }
                : {}),
            },
          };
        }),
      );
    };
    const toggleStar = (event: Event) => {
      const detail = (event as CustomEvent<CanvasNodeStarEvent>).detail;
      if (!detail?.id?.startsWith("converge-")) return;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== detail.id) return node;
          const data = node.data as Record<string, unknown>;
          const starred = !Boolean(data.starred);
          return {
            ...node,
            data: {
              ...data,
              starred,
              label: canvasNodeLabel(
                node.id,
                (data.nodeKind as CanvasNodeKind) || "text",
                String(data.nodeTitle || "收斂節點"),
                String(data.nodeContent || ""),
                data.imageUrl as string | undefined,
                data.nodeColor as string | undefined,
                starred,
              ),
            },
          };
        }),
      );
    };
    const addResult = (event: Event) => {
      const content = String(
        (event as CustomEvent<{ content?: string }>).detail?.content || "",
      );
      const preview = convergenceToPreview(content);
      if (!preview.drafts.length) return;
      const ids = new Map(
        preview.drafts.map((draft) => [
          draft.id,
          `converge-${crypto.randomUUID()}`,
        ]),
      );
      const colors = colorsByPath(preview.drafts, preview.relations);
      const created = preview.drafts.map((draft) => {
        const id = ids.get(draft.id)!;
        const color = colors.get(draft.id) || "var(--node-context)";
        return {
          id,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          position: { x: 80, y: 70 },
          data: {
            label: canvasNodeLabel(
              id,
              "text",
              draft.title,
              draft.content,
              undefined,
              color,
            ),
            nodeKind: "text",
            nodeTitle: draft.title,
            nodeContent: draft.content,
            nodeColor: color,
            starred: false,
            convergenceGenerated: true,
          },
          style: { ...nodeStyle("converge"), width: 280, background: color },
        };
      });
      const relationKeys = new Set<string>();
      const createdEdges = preview.relations.flatMap((relation) => {
        const source = ids.get(relation.source);
        const target = ids.get(relation.target);
        const key = `${relation.source}->${relation.target}`;
        if (!source || !target || relationKeys.has(key)) return [];
        relationKeys.add(key);
        return [
          {
            id: `converge-edge-${crypto.randomUUID()}`,
            source,
            target,
            convergenceGenerated: true,
            ...(relation.label ? { label: relation.label } : {}),
            type: "bezier" as const,
            style: { stroke: "var(--primary)" },
            labelStyle: { fill: "var(--muted)", fontSize: 11 },
          },
        ];
      });
      const positioned = layoutConvergence(created, createdEdges);
      const generatedIds = new Set(
        nodes
          .filter((node) =>
            Boolean(
              (node.data as Record<string, unknown>).convergenceGenerated,
            ),
          )
          .map((node) => node.id),
      );
      setNodes((current) => [
        ...current.filter((node) => !generatedIds.has(node.id)),
        ...positioned,
      ]);
      setEdges((current) => [
        ...current.filter(
          (edge) =>
            !generatedIds.has(edge.source) &&
            !generatedIds.has(edge.target) &&
            !Boolean((edge as Record<string, unknown>).convergenceGenerated),
        ),
        ...createdEdges,
      ]);
    };
    window.addEventListener("context-flow:add-node", addNode);
    window.addEventListener("context-flow:add-convergence-result", addResult);
    window.addEventListener("context-flow:update-node", updateNode);
    window.addEventListener("context-flow:toggle-star", toggleStar);
    const updateEdge = (event: Event) => {
      const detail = (event as CustomEvent<EdgeEditEvent>).detail;
      if (
        !detail ||
        (detail.area !== "converge" && !detail.id.startsWith("converge-"))
      )
        return;
      setEdges((current) =>
        current.map((edge) =>
          edge.id === detail.id
            ? { ...edge, label: detail.label || undefined }
            : edge,
        ),
      );
    };
    const deleteEdge = (event: Event) => {
      const detail = (event as CustomEvent<EdgeEditEvent>).detail;
      if (
        !detail ||
        (detail.area !== "converge" && !detail.id.startsWith("converge-"))
      )
        return;
      setEdges((current) => current.filter((edge) => edge.id !== detail.id));
    };
    const connect = (event: Event) => {
      const detail = (event as CustomEvent<Connection>).detail;
      if (
        !detail ||
        !String(detail.source).startsWith("converge-") ||
        !String(detail.target).startsWith("converge-")
      )
        return;
      setEdges((current) =>
        addEdge(
          { ...detail, type: "bezier", style: { stroke: "var(--primary)" } },
          current,
        ),
      );
    };
    window.addEventListener("context-flow:update-edge", updateEdge);
    window.addEventListener("context-flow:delete-edge", deleteEdge);
    window.addEventListener("context-flow:connect", connect);
    const layoutNodes = () =>
      setNodes((current) => layoutConvergence(current, edges));
    window.addEventListener("context-flow:layout-converge", layoutNodes);
    return () => {
      window.removeEventListener("context-flow:add-node", addNode);
      window.removeEventListener(
        "context-flow:add-convergence-result",
        addResult,
      );
      window.removeEventListener("context-flow:update-node", updateNode);
      window.removeEventListener("context-flow:toggle-star", toggleStar);
      window.removeEventListener("context-flow:update-edge", updateEdge);
      window.removeEventListener("context-flow:delete-edge", deleteEdge);
      window.removeEventListener("context-flow:connect", connect);
      window.removeEventListener("context-flow:layout-converge", layoutNodes);
    };
  }, [nodes, edges, setNodes, setEdges]);
  useEffect(() => {
    if (!editable) return;
    const clearCanvas = (event: Event) => {
      if (
        (event as CustomEvent<{ area?: string }>).detail?.area === "converge"
      ) {
        setNodes([]);
        setEdges([]);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const selectedIds = new Set(
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '.workspace-area[data-canvas-area="converge"] .react-flow__node.selected',
          ),
        )
          .map((node) => node.dataset.id)
          .filter((id): id is string => Boolean(id)),
      );
      if (!selectedIds.size) return;
      event.preventDefault();
      setNodes((current) =>
        current.filter((node) => !selectedIds.has(node.id)),
      );
      setEdges((current) =>
        current.filter(
          (edge) =>
            !selectedIds.has(edge.source) && !selectedIds.has(edge.target),
        ),
      );
    };
    window.addEventListener("context-flow:clear-canvas", clearCanvas);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("context-flow:clear-canvas", clearCanvas);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editable, setNodes, setEdges]);
  return (
    <div className="relative min-h-48 min-w-0 flex-1 canvas-grid">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={editable ? onNodesChange : undefined}
        onEdgesChange={editable ? onEdgesChange : undefined}
        nodesDraggable={editable}
        nodesConnectable={editable}
        fitView
      >
        <Background gap={18} size={1} color="var(--border)" />
        <Controls />
      </ReactFlow>
      {!nodes.length && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="rounded-primary border border-dashed border-border bg-surface p-3 text-center text-xs text-muted">
            新增收斂節點，整理結論與決策
          </p>
        </div>
      )}
    </div>
  );
}

function ToolbarIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </Button>
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-primary border border-border bg-surface px-2 py-1 text-[11px] text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}
async function fileFingerprint(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function ResourceComposer({
  projectId,
  onAdd,
}: {
  projectId: string;
  onAdd: (resource: DataResource) => void;
}) {
  const [kind, setKind] = useState<DataResourceKind>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const addFile = async (file?: File) => {
    if (!file || uploading) return;
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setFileError("請選擇 20 MB 以內的非空白檔案");
      return;
    }
    setUploading(true);
    setFileError("");
    try {
      const isImage = file.type.startsWith("image/");
      const text =
        !isImage && file.size < 512000 && file.type.startsWith("text/")
          ? (await file.text()).slice(0, 8000)
          : "";
      const uploaded = await uploadFile(projectId, file);
      onAdd({
        id: crypto.randomUUID(),
        kind: isImage ? "image" : "file",
        title: file.name,
        content: text || `${file.name} (${Math.ceil(file.size / 1024)} KB)`,
        contentHash: await fileFingerprint(file),
        url: uploaded.url,
      });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "檔案上傳失敗");
    } finally {
      setUploading(false);
    }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      kind,
      title: title.trim(),
      content: kind === "text" ? content.trim() : undefined,
      url: kind === "link" ? url.trim() : undefined,
    });
    setTitle("");
    setContent("");
    setUrl("");
  };
  return (
    <div
      className="space-y-3 rounded-primary border border-dashed border-primary/40 bg-primary/10 p-3"
      data-export-exclude
      data-tour="resources"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void addFile(event.dataTransfer.files[0]);
      }}
    >
      {fileError && (
        <p role="alert" className="text-xs text-destructive">
          {fileError}
        </p>
      )}
      {uploading && (
        <p role="status" className="text-xs text-muted">
          檔案上傳中…
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          type="button"
          variant={kind === "text" ? "default" : "ghost"}
          onClick={() => setKind("text")}
        >
          <FileText className="size-3.5" />
          文字
        </Button>
        <Button
          size="sm"
          type="button"
          variant={kind === "link" ? "default" : "ghost"}
          onClick={() => setKind("link")}
        >
          <Link2 className="size-3.5" />
          連結
        </Button>
        <Button
          size="sm"
          type="button"
          variant={kind === "file" ? "default" : "ghost"}
          onClick={() => setKind("file")}
        >
          <Upload className="size-3.5" />
          檔案
        </Button>
      </div>
      {kind === "file" && (
        <label className="grid min-h-28 cursor-pointer place-items-center rounded-primary border border-dashed border-border bg-surface/70 text-center text-xs text-muted hover:border-primary hover:bg-primary/10">
          <div>
            <Upload className="mx-auto mb-1 size-5 text-primary" />
            <p>拖曳檔案到這裡</p>
            <p className="mt-1 text-[11px]">或點擊選擇檔案</p>
          </div>
          <input
            className="sr-only"
            type="file"
            disabled={uploading}
            onChange={(event) => {
              void addFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
      {kind !== "file" && (
        <form className="space-y-2" onSubmit={submit}>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="資料標題"
            required
          />
          {kind === "text" ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-16 w-full resize-none rounded-primary border border-border bg-surface p-2 text-xs"
              placeholder="貼上筆記或文字…"
            />
          ) : (
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              type="url"
              placeholder="https://…"
              required
            />
          )}
          <Button type="submit" size="sm" className="w-full">
            <Plus className="size-3.5" />
            加入資料池
          </Button>
        </form>
      )}
    </div>
  );
}
function ResourceItem({
  resource,
  onRemove,
  canRemove = true,
}: {
  resource: DataResource;
  onRemove: () => void;
  canRemove?: boolean;
}) {
  const [downloadError, setDownloadError] = useState("");
  const Icon =
    resource.kind === "link"
      ? Link2
      : resource.kind === "image"
        ? ImageIcon
        : FileText;
  return (
    <div
      data-export-resource
      className="group rounded-primary border border-border bg-surface p-2.5"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{resource.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
            {resource.content || resource.url || "等待解析"}
          </p>
          {resource.url?.startsWith("r2://") && (
            <button
              type="button"
              className="mt-1 text-xs text-primary underline"
              onClick={() => {
                setDownloadError("");
                void downloadFile(resource.url!.slice(5)).catch((error) =>
                  setDownloadError(
                    error instanceof Error ? error.message : "下載失敗",
                  ),
                );
              }}
            >
              下載原始檔案
            </button>
          )}
          {downloadError && (
            <p role="alert" className="text-xs text-destructive">
              {downloadError}
            </p>
          )}
        </div>
        <button
          type="button"
          className={`${canRemove ? "invisible group-hover:visible" : "hidden"}`}
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`移除 ${resource.title}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
