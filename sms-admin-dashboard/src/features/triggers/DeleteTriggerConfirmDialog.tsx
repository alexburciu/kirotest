import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteTriggerConfirmDialogProps {
  open: boolean;
  triggerName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export function DeleteTriggerConfirmDialog({
  open,
  triggerName,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteTriggerConfirmDialogProps) {
  const [confirmValue, setConfirmValue] = React.useState("");

  // Reset input whenever the dialog closes
  React.useEffect(() => {
    if (!open) {
      setConfirmValue("");
    }
  }, [open]);

  const isConfirmEnabled = confirmValue === triggerName && !isDeleting;

  function handleCancel() {
    setConfirmValue("");
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Trigger</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. Type the trigger name to confirm:
          </p>
          <code className="block rounded bg-muted px-2 py-1 font-mono text-sm">
            {triggerName}
          </code>
          <Input
            aria-label="Confirm trigger name"
            placeholder="Type trigger name…"
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            disabled={isDeleting}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!isConfirmEnabled}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
