import { useEffect, useRef } from "react";

/**
 * A generated woven colour field that twists under the cursor.
 *
 * Generated rather than sampled from an image, and that is the load-bearing
 * decision: a photograph quantised to large cells reads as a broken image,
 * because the eye keeps trying to resolve it back into the thing it obviously
 * is. A field with no subject has nothing to resolve into, so the texture can
 * be looked at directly. It also downloads nothing and adapts to any panel.
 *
 * Four things make it cloth rather than a mosaic:
 *   1. Two octaves of value noise, posterised into two ramps.
 *   2. Run-length encoding per row, so cell widths VARY AS A CONSEQUENCE of
 *      the banding rather than at random. That is what reads as woven.
 *   3. Dense parallel stitches inside each cell. Flat blocks of colour look
 *      like a loading skeleton.
 *   4. Stitch angles quantised to four directions, not a continuum. Real cloth
 *      is cut and laid in pieces; a continuously varying hatch reads as smear.
 */

/** Row height in CSS pixels. Rows stay uniform; only the widths vary. */
const ROW = 16;
/** Column quantisation before run-length encoding, so the smallest cell width. */
const COL = 16;
/** Gap between stitches. Tight enough to read as thread, loose enough to see colour. */
const STITCH = 3;

/** How far the effect reaches from the pointer, in CSS pixels. */
const RADIUS = 175;
/** Peak displacement at the pointer, in CSS pixels. */
const PUSH = 30;
/** How far the displacement rotates around the pointer, in radians, at full strength. */
const SWIRL = 0.9;

/** A spring, not exponential decay. `dx += (target - dx) * ease` never
 *  overshoots, so the field stops dead the instant the cursor does, which
 *  reads as inert. Stiffness and damping let cells overrun and settle back,
 *  and that overshoot is what gives the cloth weight. */
const STIFFNESS = 0.16;
const DAMPING = 0.76;

/** Below 1 the sampled pointer trails the real one, which adds drag. Without
 *  it the field snaps to wherever the cursor jumped between frames, so a fast
 *  swipe cuts instead of dragging. */
const POINTER_EASE = 0.2;
/** Fade in on enter, out on leave, per frame. */
const INTENSITY_EASE = 0.09;

/** Two ramps, dark to light, chosen to sit against a pale page. */
const CANOPY = ["#0b1a10", "#12271a", "#1d3d23", "#2d5a2c", "#437b38", "#63a049", "#8fc167"];
const WATER = ["#0c1e2e", "#13304a", "#1e4a6b", "#2f6e93", "#4f95b8", "#7fb9d4", "#b3d9e8"];

interface Cell {
  x: number;
  y: number;
  w: number;
  color: string;
  /** Stitch direction at rest, in radians. */
  angle: number;
  /** Current offset from rest, and its spring velocity. */
  dx: number;
  dy: number;
  vx: number;
  vy: number;
}

/** Deterministic hash to [0,1). Seeded, so the field is identical every load. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Value noise with smooth interpolation, so posterising produces flowing
 *  bands rather than confetti. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // Smoothstep on both axes. Linear interpolation leaves visible diamond
  // artefacts at the lattice points once the result is quantised.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function PixelField({ className }: { className?: string | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    // Before anything else is constructed. jsdom implements neither a 2D
    // context nor ResizeObserver, and the panel still mounts under vitest
    // because Tailwind's `hidden lg:block` is inert with no stylesheet.
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Checked in JS, separately from the stylesheet. The global reduced-motion
    // block in index.css cannot reach a canvas render loop, so a reader of the
    // diff would reasonably assume this is covered when it is not. Under
    // reduced motion the field still renders, it just never moves.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cells: Cell[] = [];
    let base: HTMLCanvasElement | null = null;
    let frame = 0;
    let size = { width: 0, height: 0 };

    // Off-canvas by default, so the field rests flat until the pointer arrives
    // rather than twisting around the top-left corner on load.
    let pointer = { x: -9999, y: -9999 };
    const smooth = { x: -9999, y: -9999 };
    let intensity = 0;
    let targetIntensity = 0;
    let dirty = false;

    /** Fills one cell with its colour and its stitches, clipped to the cell. */
    function stitch(
      c: CanvasRenderingContext2D,
      w: number,
      h: number,
      color: string,
      angle: number,
    ) {
      c.beginPath();
      c.rect(-w / 2, -h / 2, w, h);
      c.clip();
      c.fillStyle = color;
      // The half pixel of bleed closes the hairline seams that open between
      // neighbours at sub-pixel positions.
      c.fillRect(-w / 2 - 0.5, -h / 2 - 0.5, w + 1, h + 1);

      c.rotate(angle);
      // Half the diagonal, so the stitches still span the cell once rotated to
      // any of the four angles.
      const reach = Math.hypot(w, h) / 2 + 2;
      c.fillStyle = "rgba(255,255,255,0.10)";
      for (let ly = -reach; ly < reach; ly += STITCH) c.fillRect(-reach, ly, reach * 2, 1);
      c.fillStyle = "rgba(0,0,0,0.13)";
      for (let ly = -reach + STITCH / 2; ly < reach; ly += STITCH) {
        c.fillRect(-reach, ly, reach * 2, 1);
      }
    }

    function build() {
      const rect = wrap!.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      size = { width: rect.width, height: rect.height };

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(rect.width / COL);
      const rows = Math.ceil(rect.height / ROW);
      const next: Cell[] = [];
      // Kept as a grid rather than computed inline, so a run always takes the
      // angle of the square it starts on whatever its width.
      const angles = new Float32Array(cols * rows);

      for (let row = 0; row < rows; row++) {
        const vertical = row / rows;
        let runStart = 0;
        let runColor = "";

        for (let col = 0; col <= cols; col++) {
          let color = "";
          if (col < cols) {
            // Two octaves: the coarse one lays out the large shapes, the fine
            // one breaks up the band edges so they read as torn rather than
            // drawn with a compass.
            const n = noise(col / 9, row / 9) * 0.72 + noise(col / 3.2, row / 3.2) * 0.28;
            // The ramp boundary wanders with the noise, so canopy and water
            // interlock instead of meeting on a straight horizon.
            const ramp = vertical + (n - 0.5) * 0.42 > 0.55 ? WATER : CANOPY;
            const step = Math.min(ramp.length - 1, Math.max(0, Math.floor(n * ramp.length)));
            color = ramp[step]!;
            // Four directions rather than a continuum.
            angles[row * cols + col] = (Math.floor(hash(col, row) * 4) * Math.PI) / 4;
          }

          // Run-length encode: close the current run when the colour changes
          // or the row ends.
          if (color !== runColor) {
            if (runColor && col > runStart) {
              next.push({
                x: runStart * COL,
                y: row * ROW,
                w: (col - runStart) * COL,
                color: runColor,
                angle: angles[row * cols + runStart]!,
                dx: 0,
                dy: 0,
                vx: 0,
                vy: 0,
              });
            }
            runStart = col;
            runColor = color;
          }
        }
      }
      cells = next;

      // The whole field at rest is rendered once and blitted as a single image
      // each frame. Stitching one cell costs a clip, a rotate and a dozen
      // fills, and there are a few thousand cells: far too much to redo every
      // frame.
      base = document.createElement("canvas");
      base.width = canvas!.width;
      base.height = canvas!.height;
      const bctx = base.getContext("2d");
      if (!bctx) return;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const cell of cells) {
        bctx.save();
        bctx.translate(cell.x + cell.w / 2, cell.y + ROW / 2);
        stitch(bctx, cell.w, ROW, cell.color, cell.angle);
        bctx.restore();
      }
    }

    function paint() {
      if (!base) {
        frame = requestAnimationFrame(paint);
        return;
      }

      smooth.x += (pointer.x - smooth.x) * POINTER_EASE;
      smooth.y += (pointer.y - smooth.y) * POINTER_EASE;
      intensity += (targetIntensity - intensity) * INTENSITY_EASE;

      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.drawImage(base, 0, 0);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (intensity < 0.002) {
        // Settled. Zero every cell rather than leaving stale offsets lying
        // around: a cell that drifted outside the redraw region keeps whatever
        // offset it had and stops being integrated. The base blit hides it,
        // but next time the pointer passes it starts from a displacement it
        // should not have and visibly snaps.
        if (dirty) {
          for (const cell of cells) {
            cell.dx = 0;
            cell.dy = 0;
            cell.vx = 0;
            cell.vy = 0;
          }
          dirty = false;
        }
        frame = requestAnimationFrame(paint);
        return;
      }
      dirty = true;

      // A full-width band, NOT an arc-clipped disc.
      //
      // clip() on an arc is antialiased, so a clearRect under it only partly
      // erases a 1px ring at the boundary, and the cells redrawn under the
      // same soft clip only partly cover it again. What survives each frame is
      // a faint grey ring that tracks the pointer and reads as a rendering
      // defect. A band is axis aligned, so the clear is exact.
      const reach = RADIUS + PUSH + 40;
      const bandTop = Math.floor(smooth.y - reach);
      const bandBottom = Math.ceil(smooth.y + reach);
      ctx!.clearRect(0, bandTop, size.width, bandBottom - bandTop);

      for (const cell of cells) {
        const cx = cell.x + cell.w / 2;
        const cy = cell.y + ROW / 2;
        const ox = cx - smooth.x;
        const oy = cy - smooth.y;
        const dist = Math.hypot(ox, oy);

        // Reject on the ROW only. The band is full width, so a run's
        // horizontal extent cannot put it outside the cleared region, and a
        // radial test here would skip wide runs whose centre falls outside the
        // disc, leaving a white crescent where they should have been repainted.
        if (cy + ROW < bandTop || cy - ROW > bandBottom) continue;

        let targetX = 0;
        let targetY = 0;
        if (dist < RADIUS && dist > 0.01) {
          // Squared falloff. A linear ramp moves the whole radius as one slab,
          // which reads as a rectangle sliding.
          const falloff = (1 - dist / RADIUS) ** 2 * intensity;
          // Rotating the offset is what makes it a twirl. A purely radial push
          // is a shove: it reads as a bubble under a sheet and looks identical
          // whichever way you approach it.
          const angle = SWIRL * falloff;
          const sin = Math.sin(angle);
          const cos = Math.cos(angle);
          const ux = ox / dist;
          const uy = oy / dist;
          const magnitude = PUSH * falloff;
          targetX = (ux * cos - uy * sin) * magnitude;
          targetY = (ux * sin + uy * cos) * magnitude;
        }

        cell.vx = (cell.vx + (targetX - cell.dx) * STIFFNESS) * DAMPING;
        cell.vy = (cell.vy + (targetY - cell.dy) * STIFFNESS) * DAMPING;
        cell.dx += cell.vx;
        cell.dy += cell.vy;

        ctx!.save();
        ctx!.translate(cx + cell.dx, cy + cell.dy);
        stitch(ctx!, cell.w, ROW, cell.color, cell.angle);
        ctx!.restore();
      }

      frame = requestAnimationFrame(paint);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // First contact places the smoothed pointer outright. Easing it in from
      // -9999 would drag a twist diagonally across the panel on the way to the
      // cursor.
      if (targetIntensity === 0) {
        smooth.x = x;
        smooth.y = y;
      }
      pointer = { x, y };
      targetIntensity = 1;
    }

    function onPointerLeave() {
      // Intensity falls to zero in place rather than the pointer flying off
      // canvas, so the cloth relaxes where it was grabbed instead of being
      // dragged out of frame.
      targetIntensity = 0;
    }

    build();
    paint();

    if (!reduceMotion) {
      wrap.addEventListener("pointermove", onPointerMove);
      wrap.addEventListener("pointerleave", onPointerLeave);
    }

    const observer = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      // Only a real size change. ResizeObserver also fires on sub-pixel
      // reflows, and rebuilding re-renders every cell twice over.
      if (Math.abs(rect.width - size.width) > 1 || Math.abs(rect.height - size.height) > 1) {
        build();
      }
    });
    observer.observe(wrap);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      {/* aria-hidden: it carries no information, and describing a twisting
          colour field would be noise on a login form. */}
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />
    </div>
  );
}
