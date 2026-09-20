import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * The design's slider: a 2px track with a 14px handle ringed in the accent.
 *
 * It replaces `<input type="range">` with `accent-color`, which was the single
 * most obviously unfinished control in the app: a native range renders as a
 * chunky platform widget that looks nothing like the rest of the interface and
 * differs between macOS, Windows and Linux.
 *
 * Built on a real `role="slider"` rather than a styled native input, because
 * the two things a native range gives you for free are keyboard support and
 * screen reader semantics, and both are reproduced explicitly here: arrows and
 * Home/End move it, and `aria-valuetext` carries the caller's phrasing so the
 * announcement says what the number MEANS rather than reading a bare decimal.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  valueText,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  label: string;
  /** Spoken instead of the raw number. */
  valueText?: string | undefined;
  className?: string | undefined;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fraction = (value - min) / (max - min);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      // Snapped to the step, then rounded away the floating point noise that
      // 0.1 increments otherwise leave on the value.
      const snapped = Math.round(raw / step) * step;
      const decimals = (String(step).split(".")[1] ?? "").length;
      onChange(Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals)));
    },
    [min, max, step, onChange],
  );

  // Listeners live on the window for the duration of a drag, so the handle
  // keeps following the pointer after it leaves the track. Bound only while
  // dragging rather than permanently, so an idle slider costs nothing.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!dragging.current) return;
      event.preventDefault();
      setFromClientX(event.clientX);
    }
    function onUp() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setFromClientX]);

  function onKeyDown(event: React.KeyboardEvent) {
    const large = (max - min) / 10;
    const moves: Record<string, number> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -large,
      PageUp: large,
    };

    if (event.key === "Home") {
      event.preventDefault();
      onChange(min);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onChange(max);
      return;
    }

    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const decimals = (String(step).split(".")[1] ?? "").length;
    onChange(Number(Math.min(max, Math.max(min, value + delta)).toFixed(decimals)));
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      {...(valueText ? { "aria-valuetext": valueText } : {})}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragging.current = true;
        // Click-to-position, so the track is not just decoration around the
        // handle.
        setFromClientX(event.clientX);
        event.currentTarget.focus();
      }}
      className={cn("relative flex h-5 w-full cursor-pointer items-center touch-none", className)}
    >
      <div ref={trackRef} className="h-0.5 w-full rounded-full bg-line">
        <div
          className="h-full rounded-full bg-acc"
          style={{ width: `${fraction * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <span
        aria-hidden="true"
        className="absolute h-[14px] w-[14px] -translate-x-1/2 rounded-full border-[3px] border-acc bg-white shadow-[var(--sh-thumb)]"
        style={{ left: `${fraction * 100}%` }}
      />
    </div>
  );
}
