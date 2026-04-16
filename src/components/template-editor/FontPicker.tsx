import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const SYSTEM_FONTS = [
  'Inter',
  'Grown',
  'TT Interphases Pro Condensed',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Palatino Linotype',
  'Garamond',
  'Comic Sans MS',
  'Impact',
];

export interface CustomFont {
  name: string;
  url: string;
}

interface FontPickerProps {
  value: string;
  onChange: (fontFamily: string) => void;
  customFonts: CustomFont[];
  onCustomFontsChange: (fonts: CustomFont[]) => void;
}

// Load a custom font into the document
function loadFontFace(name: string, url: string) {
  const existing = document.querySelector(`style[data-font="${name}"]`);
  if (existing) return;

  const style = document.createElement('style');
  style.dataset.font = name;
  style.textContent = `
    @font-face {
      font-family: '${name}';
      src: url('${url}') format('woff2'), url('${url}') format('woff'), url('${url}') format('truetype');
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

export default function FontPicker({ value, onChange, customFonts, onCustomFontsChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load all custom fonts on mount
  useEffect(() => {
    customFonts.forEach(f => loadFontFace(f.name, f.url));
  }, [customFonts]);

  // Calculate position when opening
  const toggleOpen = useCallback(() => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const validExts = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validExts.includes(ext)) {
      toast({ title: 'Ongeldig bestandstype', description: 'Upload een .ttf, .otf, .woff of .woff2 bestand', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Bestand te groot (max 5MB)', variant: 'destructive' });
      return;
    }

    setUploading(true);

    const fontName = file.name.replace(/\.(ttf|otf|woff2?)/i, '').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
    const filePath = `${user.id}/fonts/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage.from('quote-pdfs').upload(filePath, file);
    if (error) {
      toast({ title: 'Upload mislukt', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(filePath);
    const newFont: CustomFont = { name: fontName, url: urlData.publicUrl };

    loadFontFace(fontName, urlData.publicUrl);
    onCustomFontsChange([...customFonts, newFont]);
    onChange(fontName);
    toast({ title: `Lettertype "${fontName}" geüpload` });
    setUploading(false);
    setOpen(false);

    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFont = (name: string) => {
    onCustomFontsChange(customFonts.filter(f => f.name !== name));
    if (value === name) onChange('Inter');
    // Remove style tag
    document.querySelector(`style[data-font="${name}"]`)?.remove();
  };

  const allFonts = [...SYSTEM_FONTS, ...customFonts.map(f => f.name)];

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="h-7 text-xs border rounded px-2 bg-background flex items-center gap-1 min-w-[100px] max-w-[140px] hover:bg-accent transition-colors"
        style={{ fontFamily: value }}
      >
        <span className="truncate flex-1 text-left">{value}</span>
        <ChevronDown size={10} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[240px] bg-popover border border-border rounded-lg shadow-lg">
          <div className="max-h-[280px] overflow-y-auto p-1">
            {/* System fonts */}
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
              Systeemlettertypen
            </p>
            {SYSTEM_FONTS.map(font => (
              <button
                key={font}
                onClick={() => { onChange(font); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${value === font ? 'bg-accent font-medium' : ''}`}
                style={{ fontFamily: font }}
              >
                {font}
              </button>
            ))}

            {/* Custom fonts */}
            {customFonts.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5 mt-2">
                  Eigen lettertypen
                </p>
                {customFonts.map(font => (
                  <div key={font.name} className="flex items-center group">
                    <button
                      onClick={() => { onChange(font.name); setOpen(false); }}
                      className={`flex-1 text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors ${value === font.name ? 'bg-accent font-medium' : ''}`}
                      style={{ fontFamily: font.name }}
                    >
                      {font.name}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFont(font.name); }}
                      className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Upload button */}
          <div className="border-t p-2">
            <label>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5 cursor-pointer" disabled={uploading} asChild>
                <span>
                  <Upload size={12} />
                  {uploading ? 'Uploaden...' : 'Lettertype uploaden'}
                </span>
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              .ttf, .otf, .woff, .woff2 · max 5MB
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export { SYSTEM_FONTS };
