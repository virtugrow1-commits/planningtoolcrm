import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type { TemplateBlock, ImageBlock } from '@/types/templateBlocks';

interface BlockPropertiesPanelProps {
  block: TemplateBlock;
  onUpdate: (updates: Partial<TemplateBlock>) => void;
}

export default function BlockPropertiesPanel({ block, onUpdate }: BlockPropertiesPanelProps) {
  return (
    <div className="w-[220px] border-l bg-background sticky top-0 self-start max-h-[calc(100vh-120px)] z-20 flex flex-col">
      <div className="px-3 py-2 border-b">
        <span className="text-sm font-medium text-foreground">Eigenschappen</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Position */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Positie</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">X (px)</Label>
              <Input
                type="number"
                value={Math.round(block.x ?? 0)}
                onChange={(e) => onUpdate({ x: Number(e.target.value) } as any)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Y (px)</Label>
              <Input
                type="number"
                value={Math.round(block.y ?? 0)}
                onChange={(e) => onUpdate({ y: Number(e.target.value) } as any)}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Grootte</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Breedte (px)</Label>
              <Input
                type="number"
                value={Math.round(block.w ?? 200)}
                onChange={(e) => onUpdate({ w: Number(e.target.value) } as any)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Hoogte (px)</Label>
              <Input
                type="number"
                value={Math.round(block.h ?? 60)}
                onChange={(e) => onUpdate({ h: Number(e.target.value) } as any)}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Image-specific properties */}
        {block.type === 'image' && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Afbeelding</p>
            <div className="space-y-1">
              <Label className="text-[10px]">Breedte (%)</Label>
              <Slider
                value={[(block as ImageBlock).width || 100]}
                onValueChange={([v]) => onUpdate({ width: v } as any)}
                min={10}
                max={100}
                step={1}
              />
              <span className="text-[10px] text-muted-foreground">{(block as ImageBlock).width || 100}%</span>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Alt tekst</Label>
              <Input
                value={(block as ImageBlock).alt || ''}
                onChange={(e) => onUpdate({ alt: e.target.value } as any)}
                className="h-7 text-xs"
                placeholder="Beschrijving..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Uitlijning</Label>
              <Select
                value={(block as ImageBlock).alignment || 'center'}
                onValueChange={(v) => onUpdate({ alignment: v } as any)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Links</SelectItem>
                  <SelectItem value="center">Midden</SelectItem>
                  <SelectItem value="right">Rechts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Text block extras */}
        {block.type === 'text' && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tekst</p>
            <div className="space-y-1">
              <Label className="text-[10px]">Regelhoogte</Label>
              <Slider
                value={[(block as any).lineHeight || 1.5]}
                onValueChange={([v]) => onUpdate({ lineHeight: v } as any)}
                min={0.8}
                max={3}
                step={0.1}
              />
              <span className="text-[10px] text-muted-foreground">{(block as any).lineHeight || 1.5}</span>
            </div>
          </div>
        )}

        {/* Signature / checkbox / initials */}
        {(block.type === 'signature' || block.type === 'initials' || block.type === 'checkbox') && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Veld</p>
            <div className="space-y-1">
              <Label className="text-[10px]">Label</Label>
              <Input
                value={(block as any).label || ''}
                onChange={(e) => onUpdate({ label: e.target.value } as any)}
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-[10px]">Pagina</Label>
          <Input
            type="number"
            value={(block.pageIndex ?? 0) + 1}
            onChange={(e) => onUpdate({ pageIndex: Math.max(0, Number(e.target.value) - 1) } as any)}
            className="h-7 text-xs"
            min={1}
          />
        </div>
      </div>
    </div>
  );
}
