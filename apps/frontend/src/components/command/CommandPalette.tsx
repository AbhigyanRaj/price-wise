import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RAIL_ITEMS } from "@/components/layout/Rail";
import { deltaPercent } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ProductDto, RecommendationDto } from "@/lib/types";

interface Command {
  id: string;
  group: string;
  code: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * Command palette.
 *
 * Keyboard-first because the queue is keyboard-first: an analyst clearing
 * decisions should never have to reach for the mouse to get somewhere else.
 *
 * Products are only queried once something is typed. Listing the catalogue on
 * open would be a request on every Cmd-K for a list nobody reads.
 */
export function CommandPalette({
  open,
  onClose,
  isAdmin,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: pending } = useQuery({
    queryKey: ["recommendations", "palette"],
    queryFn: ({ signal }) =>
      api.paged<RecommendationDto>("/recommendations?status=PENDING&limit=8", signal),
    enabled: open,
    staleTime: 30_000,
  });

  const trimmed = query.trim();
  const { data: products } = useQuery({
    queryKey: ["products", "palette", trimmed],
    queryFn: ({ signal }) =>
      api.paged<ProductDto>(
        `/products?search=${encodeURIComponent(trimmed)}&pageSize=6`,
        signal,
      ),
    enabled: open && trimmed.length > 0,
    staleTime: 30_000,
  });

  const commands = useMemo<Command[]>(() => {
    const go: Command[] = RAIL_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => ({
      id: `go:${item.to}`,
      group: "GO TO",
      code: item.label.slice(0, 2).toUpperCase(),
      label: item.label,
      hint: "jump",
      run: () => navigate(item.to),
    }));

    const decisions: Command[] = (pending?.items ?? []).map((rec) => ({
      id: `rec:${rec.id}`,
      group: "DECISIONS",
      code: "DC",
      label: `${rec.product?.name ?? "Product"} · ${deltaPercent(rec.deltaPct)}`,
      hint: rec.product?.sku ?? "",
      run: () => navigate(`/decisions/${rec.id}`),
    }));

    const catalogue: Command[] = (products?.items ?? []).map((product) => ({
      id: `prod:${product.id}`,
      group: "PRODUCTS",
      code: "PR",
      label: product.name,
      hint: product.sku,
      run: () => navigate(`/products/${product.id}`),
    }));

    const actions: Command[] = [
      {
        id: "action:signout",
        group: "ACTIONS",
        code: "SO",
        label: "Sign out",
        run: onSignOut,
      },
    ];

    return [...go, ...decisions, ...catalogue, ...actions];
  }, [isAdmin, navigate, onSignOut, pending, products]);

  const results = useMemo(() => {
    if (!trimmed) return commands.filter((c) => c.group !== "PRODUCTS");
    const needle = trimmed.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(needle) || c.hint?.toLowerCase().includes(needle),
    );
  }, [commands, trimmed]);

  // Reset on every open, so the palette never reopens mid-search.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => setCursor(0), [trimmed]);

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    onClose();
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[cursor]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--scrim)] pt-[14vh] backdrop-blur-[3px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="pw-pal w-full max-w-[560px] overflow-hidden rounded-card border border-line3 bg-raised shadow-[var(--sh-pop)]"
      >
        <div className="flex h-[46px] items-center gap-2.5 border-b border-line px-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, decisions, activity"
            aria-label="Search"
            aria-controls="palette-results"
            className="flex-1 bg-transparent text-[14px] text-t0 outline-none placeholder:text-t4"
          />
          <kbd className="keycap">ESC</kbd>
        </div>

        <div id="palette-results" ref={listRef} className="max-h-[44vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-t4">
              No matches for &ldquo;{trimmed}&rdquo;
            </p>
          )}

          {results.map((command, index) => {
            const newGroup = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {newGroup && <p className="eyebrow px-2.5 pb-1 pt-2.5">{command.group}</p>}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => choose(command)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left",
                    index === cursor ? "bg-hover" : "hover:bg-hover",
                  )}
                >
                  <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-tag bg-panel font-mono text-[9px] text-t3">
                    {command.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-t1">
                    {command.label}
                  </span>
                  {command.hint && (
                    <span className="shrink-0 font-mono text-[10.5px] text-t5">{command.hint}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
