import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/app/theme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Three-way segmented control, not a two-way toggle.
 *
 * "System" has to be a distinct, selectable state rather than the absence of a
 * choice. A toggle cannot express "follow the OS", so choosing dark at night
 * would silently pin the app to dark forever afterwards.
 *
 * A radiogroup rather than three buttons: the options are mutually exclusive
 * and arrow keys should move between them, which is what the role buys.
 */
export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-md bg-panel p-0.5"
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
              // 24x21 fails the 24px minimum on height, and adjacent controls
              // cannot claim the spacing exception. Grown below md only, into
              // whitespace that already exists.
              "grid h-7 w-8 place-items-center rounded-[5px] transition-colors duration-[110ms] md:h-[21px] md:w-[24px]",
              active ? "bg-line3 text-t1" : "text-t4 hover:text-t2",
            )}
          >
            <Icon size={12} strokeWidth={1.6} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
