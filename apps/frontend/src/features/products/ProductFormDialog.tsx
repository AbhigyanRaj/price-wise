import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ProductInputSchema, type ProductInput, type ProductPatch } from "@pricewise/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { applyServerErrors } from "@/lib/formErrors";
import { money, percent } from "@/lib/format";
import { useCategories, useCreateProduct, useUpdateProduct } from "./api";
import type { ProductDto } from "@/lib/types";

/**
 * One dialog for create and edit, not two.
 *
 * It always validates against ProductInputSchema, even when editing. That
 * schema carries the cross-field refinement `currentPrice > cost`, which is
 * the rule most worth keeping live while someone edits a price, and
 * ProductPatchSchema cannot express it because every field is optional. The
 * server re-checks against the merged record regardless.
 *
 * A dialog rather than a route: /products/new would remount the catalog and
 * discard the filter the admin was looking at, because filter state lives in
 * component state rather than the URL.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent means create. */
  product?: ProductDto | undefined;
}) {
  const isEdit = Boolean(product);
  const { data: categories } = useCategories();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const toast = useToast();

  const form = useForm<ProductInput>({
    resolver: zodResolver(ProductInputSchema),
    values: {
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      category: product?.category ?? "",
      currentPrice: product?.currentPrice ?? 0,
      cost: product?.cost ?? 0,
      // Stored as a fraction, typed as a percent. See the note on the field.
      marginFloorPct: product?.marginFloorPct ?? 0.15,
      inventoryLevel: product?.inventoryLevel ?? 0,
    },
  });

  // Live arithmetic under the price fields, so "price must exceed cost" is
  // legible before submitting rather than after being rejected.
  const price = form.watch("currentPrice");
  const cost = form.watch("cost");
  const floorPct = form.watch("marginFloorPct");
  const margin = price > 0 ? (price - cost) / price : 0;
  const floorPrice = floorPct < 1 ? cost / (1 - floorPct) : 0;

  const pending = create.isPending || update.isPending;

  function submit(values: ProductInput) {
    const handlers = {
      onSuccess: () => {
        toast({ message: isEdit ? "Updated" : "Added", value: values.sku, tone: "pos" as const });
        onOpenChange(false);
      },
      onError: (error: unknown) =>
        applyServerErrors(form, error, {
          fallback: "Could not save this product.",
          codeToField: { CONFLICT: "sku" as const },
        }),
    };

    if (!product) {
      create.mutate(values, handlers);
      return;
    }

    // Send only what actually changed, and never the SKU: it is the tenant's
    // stable identifier for the row and ProductPatchSchema rejects it.
    const patch: ProductPatch = {};
    for (const key of Object.keys(form.formState.dirtyFields) as (keyof ProductInput)[]) {
      if (key === "sku") continue;
      Object.assign(patch, { [key]: values[key] });
    }
    update.mutate({ id: product.id, patch }, handlers);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="product-form-help">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${product?.sku}` : "Add a product"}</DialogTitle>
          <DialogDescription id="product-form-help">
            {isEdit
              ? "Only the fields you change are sent. The SKU is fixed once created."
              : "The agents price against these numbers, so cost and margin floor are the ones that matter."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submit)} className="space-y-3.5" noValidate>
          <Field
            id="sku"
            label="SKU"
            type="text"
            // readOnly, never disabled: React Hook Form drops disabled fields
            // from values, and this form always validates the full shape.
            readOnly={isEdit}
            hint={isEdit ? "Fixed once created." : "Letters, digits and hyphens."}
            error={form.formState.errors.sku?.message}
            register={form.register("sku")}
            className={isEdit ? "opacity-70" : undefined}
          />
          <Field
            id="name"
            label="Name"
            type="text"
            error={form.formState.errors.name?.message}
            register={form.register("name")}
          />
          <Field
            id="category"
            label="Category"
            type="text"
            list="product-categories"
            hint="Pick an existing one or type a new one."
            error={form.formState.errors.category?.message}
            register={form.register("category")}
          />
          <datalist id="product-categories">
            {(categories ?? []).map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="currentPrice"
              label="Current price"
              type="number"
              step="0.01"
              inputMode="decimal"
              error={form.formState.errors.currentPrice?.message}
              // The shared schemas use bare z.number(), not z.coerce.number(),
              // so a raw number input hands back a string and every numeric
              // field fails validation. This is the single easiest thing to
              // get wrong on this form.
              register={form.register("currentPrice", { valueAsNumber: true })}
            />
            <Field
              id="cost"
              label="Unit cost"
              type="number"
              step="0.01"
              inputMode="decimal"
              error={form.formState.errors.cost?.message}
              register={form.register("cost", { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="marginFloorPct"
              label="Margin floor"
              type="number"
              step="0.1"
              inputMode="decimal"
              hint="Percent, stored as a fraction."
              defaultValue={((product?.marginFloorPct ?? 0.15) * 100).toFixed(1)}
              error={form.formState.errors.marginFloorPct?.message}
              // Humans type 25, the domain stores 0.25. Converting here keeps
              // the percent-in, fraction-out convention in one place.
              register={form.register("marginFloorPct", {
                setValueAs: (value: string) => (value === "" ? NaN : Number(value) / 100),
              })}
            />
            <Field
              id="inventoryLevel"
              label="Inventory"
              type="number"
              step="1"
              inputMode="numeric"
              error={form.formState.errors.inventoryLevel?.message}
              register={form.register("inventoryLevel", { valueAsNumber: true })}
            />
          </div>

          <div className="rounded-inset border border-line bg-inset px-3 py-2">
            <p className="tnum font-mono text-[11.5px] text-t3">
              margin {percent(margin, 1)} · floor price {money(floorPrice)}
            </p>
          </div>

          {form.formState.errors.root && (
            <p role="alert" className="text-[12.5px] text-neg">
              {form.formState.errors.root.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              // "At least one field must be provided" expressed as a control
              // state rather than an error the user has to read.
              disabled={pending || (isEdit && !form.formState.isDirty)}
              aria-busy={pending}
            >
              {pending ? "Saving" : isEdit ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
