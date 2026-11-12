"use client";

export function ChipRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="mt-3">
      {label ? <p className="mb-2 text-xs tracking-wide text-[#7a6c62]">{label}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={`${label}-${option.value || "all"}`}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                active ? "bg-[#1c1612] text-white" : "bg-[#efe4d6] text-[#4a3f38] hover:bg-[#e8d5c0]"
              }`}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
