import { Mark } from "@/components/brand/Mark";
import { PipelinePreview } from "./PipelinePreview";

/**
 * The shell all three auth screens share: sign in, sign up, join by invite.
 *
 * The left panel is a product artefact rather than a tagline. Marketing copy
 * beside a form is the thing that dates; a live-looking product surface is a
 * different proposition, and it previews the centrepiece in the first three
 * seconds of a reviewer's first impression.
 *
 * One file, so a restyle touches one place rather than three.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="noise grid min-h-dvh bg-bg lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-panel lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(48rem 32rem at 20% 0%, var(--acc-a), transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-12 py-16">
          <p className="eyebrow mb-3">Dynamic pricing intelligence</p>
          {/* Styled as a headline but not marked as one. This panel is
              hidden below lg, and an h1 that vanishes with the layout leaves
              the page with no top-level heading at all. The form title below
              is what the page is actually for, so that carries the h1. */}
          <p
            aria-hidden="true"
            className="mb-3 max-w-sm text-[38px] font-semibold leading-[1.08] tracking-[-0.028em] text-t0"
          >
            Five agents. One price. Your decision.
          </p>
          <p className="mb-10 max-w-sm text-[12.5px] leading-[1.6] text-t3">
            Specialists analyse the market, your costs and demand. You approve, override or reject.
            Nothing reaches the storefront without a decision.
          </p>
          <PipelinePreview />
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-6 py-12">
        <div className="relative w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <Mark size={18} />
            <span className="text-[1.3rem] font-semibold tracking-[-0.02em] text-t0">
              Pricewise
            </span>
          </div>

          <h1 className="mb-1 text-[23px] tracking-[-0.022em]">{title}</h1>
          <p className="mb-6 text-[12.5px] leading-[1.6] text-t3">{subtitle}</p>

          {children}

          {footer && <div className="mt-6 text-[12.5px] text-t3">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
