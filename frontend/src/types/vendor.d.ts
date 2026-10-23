declare module 'html-to-image' {
  export function toPng(node: HTMLElement, options?: Record<string, unknown>): Promise<string>;
}

declare module 'jszip' {
  interface ZipFile { file(name: string, data: string, options?: { base64?: boolean }): ZipFile; generateAsync(options: { type: 'blob' }): Promise<Blob>; }
  const JSZip: new () => ZipFile;
  export default JSZip;
}

declare module 'react-markdown' {
  import type { ComponentType } from 'react';
  const ReactMarkdown: ComponentType<{ children?: string; remarkPlugins?: unknown[]; components?: Record<string, ComponentType<Record<string, unknown>>>; }>; 
  export default ReactMarkdown;
}
