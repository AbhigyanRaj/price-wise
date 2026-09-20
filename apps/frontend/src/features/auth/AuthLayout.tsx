import { Mark } from "@/components/brand/Mark";
import { PixelField } from "./PixelField";

/**
 * The shell all three auth screens share: sign in, sign up, join by invite.
 *
 * The thesis: most login screens are a centred card on a gradient, and they
 * are forgettable because the only memorable object on the page is a form.
 * This makes one large physical object the subject, puts the product's name on
 * that object, and reduces the form to quiet plumbing beside it.
 *
 * It replaces a violet wash and a scripted PipelinePreview, which was a
 * diagram of the product rather than an impression of it. The rationale is
 * worth writing into DECISIONS.md, because new-design/README.md documents the
 * old composition and CLAUDE.md §2 says a document and the code must not drift
 * silently.
 */

/* --------------------------------------------------------------------------
   Control styling for the three auth forms, written once here.

   These exist because the shadcn primitives underneath still reference the
   token names the redesign deleted. `ui/button.tsx` asks for `bg-primary`,
   which is not a token at all so no utility is emitted, and `ui/input.tsx`
   asks for `border-input`, which resolves to the input SURFACE colour and is
   therefore white on white here. Left alone the button has no fill and the
   field has no edge. Repairing the primitives touches every screen in the app
   and is its own change.
-------------------------------------------------------------------------- */

/** 16px on mobile is not a type choice, it is the fix: iOS Safari zooms the
 *  viewport on focus for any input under 16px. h-11 likewise, because 44px is
 *  the minimum comfortable touch target.
 *
 *  The focus ring is the one place the brand colour appears in the form. It
 *  has to be declared here because Input's base class carries `outline-none`,
 *  which is a utility and therefore beats the global `:focus-visible` rule in
 *  index.css. Without this the field has no focus indicator at all. */
export const AUTH_INPUT = [
  "h-11 sm:h-10 rounded-lg border-line bg-panel px-3",
  "text-[16px] sm:text-[14px] text-t0 placeholder:text-t4",
  "shadow-[0_1px_2px_rgba(26,24,20,0.04),0_2px_8px_rgba(26,24,20,0.04)]",
  "transition-all focus:border-acc/40 focus:ring-2 focus:ring-acc/20",
].join(" ");

/** Label at 12.5/500, quieting Label's 14px semibold default. */
export const AUTH_FIELD = "space-y-1.5 [&>label]:text-[12.5px] [&>label]:font-medium [&>label]:text-t0";

/**
 * Inverted, not brand coloured.
 *
 * Near-black on off-white. This is the one-accent rule in practice: the accent
 * is spent on the focus ring, so the button earns its prominence from contrast
 * rather than hue, and it never fights the panel beside it.
 *
 * The disabled state is a different SURFACE rather than a lower opacity.
 * `opacity-50` reads as broken; a flat quiet fill reads as "not yet".
 */
export const AUTH_SUBMIT = [
  "h-10 w-full rounded-lg text-[13.5px] font-semibold transition-colors duration-200",
  "bg-t0 text-bg hover:opacity-90",
  "disabled:bg-hover disabled:text-t4 disabled:opacity-100",
].join(" ");

export const AUTH_LINK = "font-medium text-t0 underline-offset-2 hover:underline";

/**
 * The column's entrance, staggered by hand rather than by an nth-child rule.
 *
 * Explicit delays at the call site mean you can read the order off the JSX,
 * and the three screens have different numbers of blocks so a positional rule
 * would put the form on a different beat on each one.
 *
 * The global prefers-reduced-motion block in index.css collapses the duration
 * to 0.001ms, so this needs no separate guard: it is a CSS animation, unlike
 * the canvas, which has to check the query itself.
 */
function rise(delay: number): React.CSSProperties {
  return { animation: "pwAuthIn 480ms var(--ease-spatial) both", animationDelay: `${delay}ms` };
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode | undefined;
}) {
  return (
    <div
      // `light` pins these screens to the paper palette whatever the user's
      // theme is. It works because index.css declares that palette as a plain
      // `.light { --bg: ... }` block: custom properties resolve from the
      // nearest ancestor that declares them, so a light subtree inside
      // <html class="dark"> wins for its own children with no !important and
      // no specificity war.
      //
      // colorScheme is not a custom property, so it does not come along with
      // the class and has to be set separately, or the native controls and the
      // scrollbar render dark inside a paper column.
      className="light flex min-h-dvh w-full bg-bg text-t0"
      style={{ colorScheme: "light" }}
    >
      {/* The p-2 inset is load-bearing. Eight pixels of page background around
          the panel is what makes it read as an object sitting ON the page,
          something you could pick up, rather than as the page's own background
          with a form floating over it. The difference is much larger than 8px
          has any right to be.

          w-[46%] rather than a true half: an exact 50/50 reads as a template.
          Slightly under half makes the form side the primary surface.

          Hidden below lg, because it is decoration driven by a cursor and a
          phone has neither a cursor nor the room. */}
      <div className="hidden w-[46%] shrink-0 p-2 lg:block">
        {/* rounded-[2px], not rounded-xl. Barely rounded reads as a physical
            panel or a printed tile; a 12px radius reads as a UI card, which is
            exactly what this must not be.

            The backing colour matters: the canvas is genuinely transparent
            where the cursor pulls the weave apart, so this pale green-grey is
            what shows through. The bright star that follows the cursor is the
            panel backing seen through a hole in the cloth rather than a
            highlight drawn on top, and that is why it feels physical. */}
        <div
          className="relative h-full w-full overflow-hidden rounded-[2px] bg-[#eef2ee]"
          style={{ animation: "pwPanelIn 700ms var(--ease-spatial) both" }}
        >
          <PixelField className="absolute inset-0" />

          {/* A scrim rather than picking a quiet corner: the field is
              generated, so there is no corner that is reliably dark. Three
              stops, not two, because a straight black to transparent ramp puts
              a visible edge halfway up. */}
          <div
            aria-hidden="true"
            // Taller and with a higher mid-stop than the first pass. The
            // wordmark row sits at the TOP of the brand block, which is where
            // a half-height scrim has almost decayed to nothing, so the type
            // there was floating on roughly 0.25 alpha over a mid-tone weave.
            // Raising the floor fixes the legibility at its cause instead of
            // pushing the type brighter to compensate.
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.80), rgba(0,0,0,0.38) 45%, transparent)",
            }}
          />

          {/* pointer-events-none on both overlays, or they swallow the cursor
              and silently kill the interaction. This is the single easiest way
              to break this design. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-8 xl:p-10">
            <div className="flex items-center gap-2.5">
              <Mark size={18} />
              <span className="text-[13px] font-medium text-white/85">Pricewise</span>
              {/* A hairline, not a fourth opacity step.
                  The first pass set this at white/45, which put it below the
                  design's three-level ladder (100 / 85 / 65) and made it
                  illegible. Separation is what it actually needed: a rule gives
                  it its own space so it reads as a byline instead of being
                  absorbed into the wordmark, and it can then sit on the
                  existing bottom rung and still be readable. */}
              <span aria-hidden="true" className="h-3 w-px bg-white/25" />
              <span className="text-[11.5px] text-white/65">by Klypup</span>
            </div>
            {/* The product name goes on the panel, not beside the form. The
                panel is the largest object on the page and the only thing
                anyone will remember; putting the name anywhere else makes the
                page generic AND makes the panel merely decorative. */}
            {/* Steps down at lg, where the panel is only ~390px of usable
                width and 44px forces an awkward third line. */}
            <p className="mt-3 text-[36px] font-normal leading-[1.02] tracking-[-0.015em] text-white xl:text-[44px]">
              Five specialists.
              <br />
              One price.
            </p>
            {/* The actual mechanic in one concrete line, not a tagline. */}
            <p className="mt-3 max-w-[330px] text-[13px] leading-relaxed text-white/65">
              Agents read the market, your costs and live demand, then propose a price. Nothing
              reaches the storefront until you approve it.
            </p>
          </div>
        </div>
      </div>

      {/* The scroll container is the OUTER element and the inner one carries
          min-h-full. A flex item centred with items-center inside a container
          shorter than its content overflows in both directions, and the top
          becomes unreachable: on a short laptop screen, or with a soft
          keyboard raised over the invite form, that silently swallows the
          first field. This pattern centres while it fits and scrolls once it
          does not. */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-6 py-12 sm:px-8">
          <div className="w-full max-w-[340px]">
            {/* The brand appears in exactly one place at every width, never
                both. Above lg the panel says it properly; below, this row
                takes over. */}
            <div className="mb-7 flex items-center gap-2.5 lg:hidden" style={rise(40)}>
              <Mark size={18} />
              <span className="text-[12.5px] font-medium text-t0">Pricewise</span>
              <span aria-hidden="true" className="h-3 w-px bg-line3" />
              {/* t3, not t4: at 11.5px this is normal-size text and owes 4.5:1.
                  --t4 reaches only about 3.2:1 on the paper background. */}
              <span className="text-[11.5px] text-t3">by Klypup</span>
            </div>

            <div style={rise(80)}>
              <h1 className="text-[30px] font-normal leading-[1.05] tracking-[-0.01em] text-t0 sm:text-[34px]">
                {title}
              </h1>
              <p className="mb-7 mt-2 text-[13px] leading-relaxed text-t3">{subtitle}</p>
            </div>

            <div style={rise(140)}>{children}</div>

            {footer && (
              <div className="mt-6 text-[12.5px] text-t3" style={rise(200)}>
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
