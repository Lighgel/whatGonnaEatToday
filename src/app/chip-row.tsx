"use client";

export function ChipRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm text-[#6b5e55]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={`${label}-${option.value || "all"}`}
              className={`rounded-full px-3 py-1 text-sm ${
                active ? "bg-[#c45c26] text-white" : "bg-[#f3e6d8] text-[#4a3f38]"
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
