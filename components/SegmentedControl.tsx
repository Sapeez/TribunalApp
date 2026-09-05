// Reusable pill-chip filter/segmented control — used by the Past Runs status
// filter (and any future single-select chip row) per §3 of the redesign
// plan. The Model Selection mode toggle keeps its own larger tile treatment
// (.model-mode-row/.mode-option in app/globals.css) since that's an
// existing, distinct visual pattern this redesign doesn't need to replace.
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="filter-row">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`filter-chip${opt.value === value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
