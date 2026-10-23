import { IconCheck } from "@tabler/icons-react";

export const NODE_COLORS = [
  { label: "粉紅", value: "#f2c6d2" },
  { label: "奶油", value: "#f4d58d" },
  { label: "薄荷", value: "#bfe3d2" },
  { label: "薰衣草", value: "#d7c8ee" },
  { label: "天藍", value: "#bfd8f3" },
  { label: "白色", value: "#ffffff" },
] as const;

export function NodeColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="mb-5 min-w-0">
      <legend className="mb-2 text-xs font-medium">底色</legend>
      <div className="grid grid-cols-6 gap-1">
        {NODE_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            aria-label={color.label}
            aria-pressed={value === color.value}
            onClick={() => onChange(color.value)}
            className="grid min-h-12 min-w-0 place-items-center rounded-primary border transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            style={{
              borderColor:
                value === color.value ? "var(--primary)" : "transparent",
              backgroundColor:
                value === color.value
                  ? "color-mix(in srgb, var(--primary) 8%, var(--surface))"
                  : undefined,
            }}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full border border-black/20 text-[#20201e]"
              style={{ backgroundColor: color.value }}
            >
              {value === color.value && (
                <IconCheck className="size-4" aria-hidden="true" />
              )}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
