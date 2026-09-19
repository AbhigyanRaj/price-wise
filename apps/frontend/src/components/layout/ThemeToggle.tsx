import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/app/theme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Three way rather than a binary switch, because "follow my system" is a real
 * preference and a two state toggle silently destroys it the first time it is
 * pressed.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-100",
              active
                ? "bg-surface-active text-ink"
                : "text-ink-tertiary hover:bg-surface-hover hover:text-ink-secondary",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
