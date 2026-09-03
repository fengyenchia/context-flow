declare module '@gsap/react' {
  export function useGSAP(callback: () => void, options?: { scope?: unknown; dependencies?: unknown[]; revertOnUpdate?: boolean }): void;
}

declare module 'react-markdown' {
  import type { ComponentType, ReactNode } from 'react';
  const ReactMarkdown: ComponentType<{ children?: string; remarkPlugins?: unknown[]; components?: Record<string, ComponentType<Record<string, unknown>>>; }>; 
  export default ReactMarkdown;
}
