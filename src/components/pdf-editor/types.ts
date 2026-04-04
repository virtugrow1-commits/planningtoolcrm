export type AnnotationTool = 'select' | 'text' | 'draw' | 'highlight' | 'sticky' | 'signature' | 'checkbox' | 'eraser';

export interface PdfAnnotation {
  id: string;
  type: 'text' | 'draw' | 'highlight' | 'sticky' | 'signature' | 'checkbox';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  // Text
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  // Draw / highlight
  path?: { x: number; y: number }[];
  strokeWidth?: number;
  opacity?: number;
  // Signature
  signatureDataUrl?: string;
  // Checkbox
  checked?: boolean;
  label?: string;
  // Sticky
  stickyColor?: string;
}

export interface PdfEditorState {
  annotations: PdfAnnotation[];
  activeTool: AnnotationTool;
  activeColor: string;
  activeStrokeWidth: number;
  activeFontSize: number;
  selectedAnnotationId: string | null;
}
