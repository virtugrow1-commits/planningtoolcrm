import { Trash2, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState, ReactNode } from 'react';

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => Promise<void> | void;
  deleteLabel?: string;
  children?: ReactNode;
}

export default function BulkActionBar({ selectedCount, onClear, onDelete, deleteLabel, children }: BulkActionBarProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 card-shadow animate-fade-in">
        <span className="text-sm font-medium text-foreground">{selectedCount} geselecteerd</span>
        <div className="flex items-center gap-2 ml-auto">
          {children}
          <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 size={14} className="mr-1" /> {deleteLabel || 'Verwijderen'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X size={14} />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt om {selectedCount} item{selectedCount !== 1 ? 's' : ''} te verwijderen.
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await onDelete();
                setDeleteConfirmOpen(false);
              }}
            >
              Verwijderen ({selectedCount})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
