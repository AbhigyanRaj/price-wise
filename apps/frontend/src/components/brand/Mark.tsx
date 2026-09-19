/**
 * Three rounded bars of increasing height.
 *
 * A price series read left to right, which is the one thing this product is
 * about. Each bar takes a different step of the accent ramp so the mark still
 * reads at 16px, where a single flat colour would turn into a blob.
 */
export function Mark({ size = 16, className }: { size?: number; className?: string | undefined }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="9" width="3.4" height="6" rx="1.2" fill="var(--acc)" />
      <rect x="6.3" y="5.5" width="3.4" height="9.5" rx="1.2" fill="var(--acc2)" />
      <rect x="11.6" y="1" width="3.4" height="14" rx="1.2" fill="var(--acc-t3)" />
    </svg>
  );
}
