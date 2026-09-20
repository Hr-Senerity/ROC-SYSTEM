export type EditorTool = 'select' | 'pan' | 'add-node' | 'connect' | 'delete';

export type EditorSelection = {
  type: 'node' | 'edge';
  id: string;
} | null;
