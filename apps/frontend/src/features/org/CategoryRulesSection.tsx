import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useCategories } from "@/features/products/api";

interface CategoryRuleDto {
  id: string;
  category: string;
  marginFloorPct: number;
  maxDeltaPct: number;
  createdAt: string;
}

/**
 * Per-category limits.
 *
 * The one sentence worth reading on this screen is the note at the bottom: a
 * category rule can only tighten. It cannot license a thinner margin than the
 * product's own floor, and it cannot widen the organization's maximum move.
 * Without saying so, an admin would reasonably assume setting 10% here lowers
 * a product configured at 25%, which is what it used to do.
 */
export function CategoryRulesSection() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const [category, setCategory] = useState("");
  const [floor, setFloor] = useState("25");
  const [delta, setDelta] = useState("15");
  const [error, setError] = useState<string | null>(null);

  const { data: rules, isPending } = useQuery({
    queryKey: ["org", "category-rules"],
    queryFn: ({ signal }) => api.get<CategoryRuleDto[]>("/org/category-rules", signal),
  });

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["org"] }),
      queryClient.invalidateQueries({ queryKey: ["audit"] }),
    ]);
  }

  const save = useMutation({
    // PUT: the operation underneath is an idempotent upsert keyed on category.
    mutationFn: () =>
      api.put<CategoryRuleDto>("/org/category-rules", {
        category,
        marginFloorPct: Number(floor) / 100,
        maxDeltaPct: Number(delta) / 100,
      }),
    onSuccess: () => {
      setCategory("");
      setError(null);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not save that rule."),
    onSettled: invalidate,
  });

  const remove = useMutation({
    // Encoded: a category can contain a space, and "Home & Kitchen" in a path
    // segment is a broken request without this.
    mutationFn: (name: string) =>
      api.delete(`/org/category-rules/${encodeURIComponent(name)}`),
    onSettled: invalidate,
  });

  const existing = rules ?? [];

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <h3>Category limits</h3>
      <p className="mt-0.5 text-[11.5px] text-t4">
        Tighter constraints for a whole category, applied on top of each product&rsquo;s own floor.
      </p>

      {isPending && <p className="mt-4 text-[12.5px] text-t4">Loading…</p>}

      {!isPending && existing.length === 0 && (
        <p className="mt-4 rounded-inset border border-line bg-inset px-3.5 py-3 text-[12.5px] text-t3">
          No category limits yet. Every product currently uses its own margin floor and your
          organization-wide maximum change.
        </p>
      )}

      {existing.length > 0 && (
        <ul className="mt-4 divide-y divide-line2 border-y border-line">
          {existing.map((rule) => (
            <li key={rule.id} className="flex h-[33px] items-center gap-3">
              <span className="flex-1 text-[12.5px] text-t1">{rule.category}</span>
              <span className="tnum font-mono text-[11.5px] text-t3">
                floor {(rule.marginFloorPct * 100).toFixed(1)}%
              </span>
              <span className="tnum font-mono text-[11.5px] text-t3">
                max ±{(rule.maxDeltaPct * 100).toFixed(0)}%
              </span>
              <button
                type="button"
                aria-label={`Remove the rule for ${rule.category}`}
                onClick={() => remove.mutate(rule.category)}
                disabled={remove.isPending}
                className="rounded-sm p-1 text-t4 transition-colors duration-[110ms] hover:bg-neg-a hover:text-neg"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="rule-category">Category</Label>
          <select
            id="rule-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-44 rounded-md border border-line bg-input px-2 text-[12.5px]"
          >
            <option value="">Choose one</option>
            {(categories ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-floor">Margin floor %</Label>
          <Input
            id="rule-floor"
            type="number"
            step="0.5"
            inputMode="decimal"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="h-8 w-28"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-delta">Max change %</Label>
          <Input
            id="rule-delta"
            type="number"
            step="1"
            inputMode="decimal"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="h-8 w-28"
          />
        </div>

        <Button type="submit" size="sm" disabled={!category || save.isPending}>
          {save.isPending ? "Saving" : "Set limit"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-neg">
          {error}
        </p>
      )}

      <p className="mt-3 text-[11.5px] leading-[1.5] text-t4">
        A category limit can only tighten. Setting a 10% floor here will not lower a product
        configured at 25%, and a wider maximum change will not exceed your organization-wide one.
      </p>
    </section>
  );
}
