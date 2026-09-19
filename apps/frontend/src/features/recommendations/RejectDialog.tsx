import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/data/Metrics";
import type { RecommendationDto } from "@/lib/types";

const MIN_REASON = 10;

/**
 * A rejection reason is not a formality. It is stored, resurfaced on future
 * recommendations for the same product, and is the only record of why a human
 * disagreed. A blank one is worthless, so the UI refuses it before the API
 * does, which turns a round trip into instant feedback.
 */
export function RejectDialog({
  recommendation,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  recommendation: RecommendationDto;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tooShort = reason.trim().length < MIN_REASON;

  useEffect(() => {
    textareaRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-line bg-panel p-5 shadow-[var(--shadow-overlay)]"
      >
        <h2 id="reject-title" className="mb-1">
          Reject this recommendation
        </h2>
        <p className="mb-4 text-[13px] text-t3">
          {recommendation.product?.sku} at <Money value={recommendation.recommendedPrice} />. The
          price will not change.
        </p>

        <label htmlFor="reject-reason" className="mb-1.5 block text-[13px] font-medium">
          Why are you rejecting it?
        </label>
        <textarea
          id="reject-reason"
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={3}
          aria-invalid={touched && tooShort ? true : undefined}
          aria-describedby="reject-hint"
          placeholder="This SKU is in a bundle promotion launching Thursday."
          className="w-full resize-none rounded-md border border-line bg-bg px-2.5 py-2 text-[13px] text-t1 placeholder:text-t4"
        />
        <p
          id="reject-hint"
          className={touched && tooShort ? "mt-1 text-[12px] text-neg" : "mt-1 text-[12px] text-t4"}
        >
          {touched && tooShort
            ? `At least ${MIN_REASON} characters. This is resurfaced next time this product is priced.`
            : "Shown on future recommendations for this product."}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={tooShort || isSubmitting}
            onClick={() => onSubmit(reason.trim())}
          >
            {isSubmitting ? "Rejecting" : "Reject"}
          </Button>
        </div>
      </div>
    </div>
  );
}
