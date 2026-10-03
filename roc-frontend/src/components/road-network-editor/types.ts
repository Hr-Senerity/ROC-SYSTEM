export type EditorTool = 'select' | 'pan' | 'add-node' | 'connect' | 'connect-curve' | 'delete';

export type EditorSelection = {
  type: 'node' | 'edge';
  id: string;
} | null;
