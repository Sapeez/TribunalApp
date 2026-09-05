// Small colored-dot status pill (tinted background, not a solid fill) — the
// dark-theme replacement for the plain solid-color .status-badge used on
// stat cards and the past-runs list. Agent-card in-run states (retrying,
// pending, etc.) keep using .status-badge as-is; this is for the
// coarser complete/running/partial-failure/failed case statuses.
export type CaseStatusKind = "complete" | "running" | "partial-failure" | "failed";

const LABELS: Record<CaseStatusKind, string> = {
  complete: "Complete",
  running: "Running",
  "partial-failure": "Partial failure",
  failed: "Failed",
};

export function StatusPill({ status }: { status: CaseStatusKind | string }) {
  const kind = (status in LABELS ? status : "complete") as CaseStatusKind;
  return (
    <span className={`status-pill ${kind}`}>
      <span className="status-pill-dot" />
      {LABELS[kind] ?? status}
    </span>
  );
}
