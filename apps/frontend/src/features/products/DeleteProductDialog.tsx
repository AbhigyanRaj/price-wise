import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useDeleteProduct } from "./api";
import type { ProductDto } from "@/lib/types";

/**
 * Names the consequence rather than asking "are you sure?".
 *
 * PricingRecommendation cascades on product delete, so the whole reasoning
 * history goes with it. AuditLog has no product foreign key, so the trail of
 * what happened survives. That asymmetry is worth stating: a reviewer will
 * wonder where the recommendations went.
 */
export function DeleteProductDialog({
  product,
  onClose,
}: {
  product: ProductDto | null;
  onClose: () => void;
}) {
  const remove = useDeleteProduct();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  if (!product) return null;

  function confirm() {
    if (!product) return;
    setError(null);
    remove.mutate(product.id, {
      onSuccess: () => {
        toast({ message: "Deleted", value: product.sku, tone: "neg" });
        onClose();
      },
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : "Could not delete this product."),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {product.sku}?</DialogTitle>
          <DialogDescription>
            {product.name} and its recommendation history will be removed. The audit trail of
            decisions already taken is kept. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-[12.5px] text-neg">
            {error}
          </p>
        )}

        <DialogFooter>
          {/* Cancel is first and takes default focus: the safe choice should be
              the one a hurried keyboard press lands on. */}
          <Button variant="ghost" size="sm" onClick={onClose} autoFocus>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={confirm}
            disabled={remove.isPending}
            aria-busy={remove.isPending}
            // The word carries the meaning, not the colour.
            className="border-neg-border text-neg hover:bg-neg-a"
          >
            {remove.isPending ? "Deleting" : "Delete product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
