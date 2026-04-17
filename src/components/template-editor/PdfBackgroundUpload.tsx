import { useState, useRef } from 'react';
import { FileUp, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PdfBackgroundUploadProps {
  pdfUrl: string | null;
  onPdfChange: (url: string | null) => void;
}

export default function PdfBackgroundUpload({ pdfUrl, onPdfChange }: PdfBackgroundUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.type !== 'application/pdf') {
      toast({ title: 'Alleen PDF-bestanden', variant: 'destructive' });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Bestand te groot (max 50MB)', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const filePath = `${user.id}/backgrounds/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('quote-pdfs').upload(filePath, file);

    if (error) {
      toast({ title: 'Upload mislukt', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('quote-pdfs').getPublicUrl(filePath);
    onPdfChange(urlData.publicUrl);
    toast({ title: 'PDF achtergrond geüpload' });
    setUploading(false);

    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = () => {
    onPdfChange(null);
  };

  return (
    <div className="flex items-center gap-2">
      {pdfUrl ? (
        <>
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            PDF achtergrond actief
          </span>
          <Button variant="ghost" size="sm" onClick={handleRemove} className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
            <X size={12} /> Verwijder
          </Button>
        </>
      ) : (
        <label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 cursor-pointer"
            disabled={uploading}
            asChild
          >
            <span>
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
              {uploading ? 'Uploaden...' : 'PDF achtergrond'}
            </span>
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
