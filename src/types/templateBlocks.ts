export type BlockType =
  | 'text'
  | 'image'
  | 'video'
  | 'table'
  | 'product-list'
  | 'page-break'
  | 'signature'
  | 'text-field'
  | 'date-field'
  | 'initials'
  | 'checkbox'
  | 'details';

export interface BaseBlock {
  id: string;
  type: BlockType;
  sortOrder: number;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string; // HTML content
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;
  lineHeight: number;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt: string;
  width: number; // percentage
  alignment: 'left' | 'center' | 'right';
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  url: string;
  caption: string;
}

export interface TableColumn {
  id: string;
  header: string;
  width?: number;
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  columns: TableColumn[];
  rows: Record<string, string>[];
}

export interface ProductListBlock extends BaseBlock {
  type: 'product-list';
  showHeaders: boolean;
  items: {
    id: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
  }[];
}

export interface PageBreakBlock extends BaseBlock {
  type: 'page-break';
}

export interface SignatureBlock extends BaseBlock {
  type: 'signature';
  label: string;
  required: boolean;
}

export interface TextFieldBlock extends BaseBlock {
  type: 'text-field';
  label: string;
  placeholder: string;
  mergeTag: string;
}

export interface DateFieldBlock extends BaseBlock {
  type: 'date-field';
  label: string;
  format: string;
  mergeTag: string;
}

export interface InitialsBlock extends BaseBlock {
  type: 'initials';
  label: string;
  required: boolean;
}

export interface CheckboxBlock extends BaseBlock {
  type: 'checkbox';
  label: string;
  description: string;
  required: boolean;
}

export interface DetailsBlock extends BaseBlock {
  type: 'details';
  fields: { id: string; label: string; mergeTag: string }[];
}

export type TemplateBlock =
  | TextBlock
  | ImageBlock
  | VideoBlock
  | TableBlock
  | ProductListBlock
  | PageBreakBlock
  | SignatureBlock
  | TextFieldBlock
  | DateFieldBlock
  | InitialsBlock
  | CheckboxBlock
  | DetailsBlock;

export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  blocks: TemplateBlock[];
  termsAndConditions?: string;
  headerImage?: string;
  backgroundColor?: string;
  accentColor?: string;
}

export const BLOCK_DEFINITIONS: { type: BlockType; label: string; icon: string; category: 'blokken' | 'invulvelden' }[] = [
  { type: 'text', label: 'Tekst', icon: 'Type', category: 'blokken' },
  { type: 'image', label: 'Afbeelding', icon: 'Image', category: 'blokken' },
  { type: 'video', label: 'Video', icon: 'Video', category: 'blokken' },
  { type: 'table', label: 'Tabel', icon: 'Table', category: 'blokken' },
  { type: 'product-list', label: 'Productlijst', icon: 'List', category: 'blokken' },
  { type: 'page-break', label: 'Pagina-einde', icon: 'SeparatorHorizontal', category: 'blokken' },
  { type: 'signature', label: 'Handtekening', icon: 'PenTool', category: 'invulvelden' },
  { type: 'text-field', label: 'Tekstveld', icon: 'TextCursorInput', category: 'invulvelden' },
  { type: 'date-field', label: 'Datum', icon: 'CalendarDays', category: 'invulvelden' },
  { type: 'initials', label: 'Initialen', icon: 'Signature', category: 'invulvelden' },
  { type: 'checkbox', label: 'Selectievakje', icon: 'CheckSquare', category: 'invulvelden' },
  { type: 'details', label: 'Details', icon: 'ClipboardList', category: 'invulvelden' },
];

export function createDefaultBlock(type: BlockType, sortOrder: number): TemplateBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const base = { id, sortOrder };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: '<p>Typ hier uw tekst...</p>', fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#000000', lineHeight: 1.5 };
    case 'image':
      return { ...base, type: 'image', src: '', alt: '', width: 100, alignment: 'center' };
    case 'video':
      return { ...base, type: 'video', url: '', caption: '' };
    case 'table':
      return { ...base, type: 'table', columns: [{ id: 'col1', header: 'Kolom 1' }, { id: 'col2', header: 'Kolom 2' }], rows: [{ col1: '', col2: '' }] };
    case 'product-list':
      return { ...base, type: 'product-list', showHeaders: true, items: [{ id: 'item1', name: 'Product', description: '', quantity: 1, unitPrice: 0, vatRate: 21 }] };
    case 'page-break':
      return { ...base, type: 'page-break' };
    case 'signature':
      return { ...base, type: 'signature', label: 'Handtekening', required: true };
    case 'text-field':
      return { ...base, type: 'text-field', label: 'Tekstveld', placeholder: 'Vul in...', mergeTag: '' };
    case 'date-field':
      return { ...base, type: 'date-field', label: 'Datum', format: 'dd-MM-yyyy', mergeTag: '{{date}}' };
    case 'initials':
      return { ...base, type: 'initials', label: 'Paraaf', required: true };
    case 'checkbox':
      return { ...base, type: 'checkbox', label: 'Akkoord', description: 'Ik ga akkoord met de voorwaarden', required: true };
    case 'details':
      return { ...base, type: 'details', fields: [
        { id: 'd1', label: 'Opgesteld voor', mergeTag: '{{company_name}}' },
        { id: 'd2', label: 'Contactpersoon', mergeTag: '{{client_name}}' },
        { id: 'd3', label: 'Datum', mergeTag: '{{date}}' },
      ] };
  }
}
