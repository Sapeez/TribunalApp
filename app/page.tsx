"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import JSZip from "jszip";
import { CASE_TEXT as SEED_CASE_TEXT, AGENT_SYSTEM_PROMPTS } from "@/prompts/seed-content";
import { ADVOCATE_ROLES, JUDGE_ROLES, ALL_ROLES, type AgentRole } from "@/lib/constants";
import { agentFailedFallback, agentRetryingFallback, agentRetryMessage, RUN_ALREADY_ACTIVE, type ErrorCode } from "@/lib/toastMessages";

type Stance = "defense" | "prosecution" | "judge";

const EXAMPLE_NAMES: Record<AgentRole, string> = {
  "defense-1":     "Jon Snow",
  "defense-2":     "Tyrion Lannister",
  "prosecution-1": "Daenerys Targaryen",
  "prosecution-2": "Grey Worm",
  "judge-1":       "Aharon Barak",
  "judge-2":       "Menachem Elon",
  "judge-3":       "Meir Shamgar",
};

const ROLE_META: Record<AgentRole, { role: string; stance: Stance }> = {
  "defense-1":    { role: "Defense",     stance: "defense"     },
  "defense-2":    { role: "Defense",     stance: "defense"     },
  "prosecution-1":{ role: "Prosecution", stance: "prosecution" },
  "prosecution-2":{ role: "Prosecution", stance: "prosecution" },
  "judge-1":      { role: "Judge",       stance: "judge"       },
  "judge-2":      { role: "Judge",       stance: "judge"       },
  "judge-3":      { role: "Judge",       stance: "judge"       },
};

function roleLabel(role: AgentRole, name?: string | null): string {
  const m = ROLE_META[role];
  return name ? `${m.role} — ${name}` : m.role;
}

type VerdictStance = "guilty" | "not-guilty" | "unknown";

function verdictStance(label: string | null | undefined): VerdictStance {
  if (!label) return "unknown";
  const normalized = label.toLowerCase();
  if (normalized.includes("not guilty") || normalized.includes("not justified")) return "not-guilty";
  if (normalized.includes("guilty") || normalized.includes("justified")) return "guilty";
  return "unknown";
}

const ROLE_SUBTITLE: Record<AgentRole, string> = {
  "defense-1":    "Primary Response",
  "defense-2":    "Supporting Response",
  "prosecution-1":"Primary Argument",
  "prosecution-2":"Supporting Argument",
  "judge-1":      "Independent Assessment",
  "judge-2":      "Independent Assessment",
  "judge-3":      "Independent Assessment",
};

function ScaleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M5 8l-3 6a3 3 0 0 0 6 0l-3-6ZM19 8l-3 6a3 3 0 0 0 6 0l-3-6ZM5 8h14M8 21h8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M4 21V9l8-6 8 6v12M9 21v-6h6v6M9 12h.01M15 12h.01M9 15h.01M15 15h.01" />
    </svg>
  );
}

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function GenerateIcon() {
  return (
    <svg className="btn-svg" viewBox="0 0 24 24">
      <path d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle className="eye-pupil" cx="12" cy="12" r="3" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function letterSpans(text: string, keyPrefix: string) {
  return text.split("").map((ch, i) => (
    <span className="btn-letter" key={`${keyPrefix}-${i}`}>{ch === " " ? " " : ch}</span>
  ));
}

function ROLE_ICON({ stance }: { stance: Stance }) {
  return stance === "defense" ? <ShieldIcon /> : <ScaleIcon />;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  type: "generating" | "success" | "error" | "retrying";
  message: string;
}

interface CuratedModel {
  id: string;
  label: string;
}

interface AgentDraft {
  model: string;
  systemPrompt: string;
  maxTokens: number;
  name: string;
}

interface AdvocateOutputRow {
  role: string;
  model: string;
  name: string | null;
  output: string | null;
  failed: boolean;
  error_message: string | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
}

interface VerdictRow {
  role: string;
  model: string;
  name: string | null;
  output: string | null;
  verdict_label: string | null;
  reasons: string[] | null;
  failed: boolean;
  error_message: string | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
}

interface CaseDetail {
  case: {
    id: string;
    case_text: string;
    status: "running" | "complete" | "partial-failure" | "failed";
    total_tokens: number | null;
    total_cost_usd: number | null;
    total_time_ms: number | null;
    submitted_at: string;
  };
  advocateOutputs: AdvocateOutputRow[];
  verdicts: VerdictRow[];
  retrying?: Partial<Record<AgentRole, { attempt: number; maxAttempts: number; code: ErrorCode }>>;
}

interface CaseSummary {
  id: string;
  case_text: string;
  submitted_at: string;
  status: string;
  total_tokens: number | null;
  total_cost_usd: number | null;
  total_time_ms: number | null;
}

interface RawAdvocateOutputRow {
  role: string;
  model: string;
  name: string | null;
  stance: string;
  output: string | null;
  failed: boolean;
  error_message: string | null;
}

interface RawVerdictRow {
  role: string;
  model: string;
  name: string | null;
  output: string | null;
  verdict_label: string | null;
  reasons: string[] | null;
  failed: boolean;
  error_message: string | null;
}

interface RawCaseDetail {
  case: CaseDetail["case"];
  advocateOutputs: RawAdvocateOutputRow[];
  verdicts: RawVerdictRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAdvocateMarkdown(row: RawAdvocateOutputRow): string {
  const label = roleLabel(row.role as AgentRole, row.name);
  const lines = [
    `# ${label}`,
    "",
    `**Model:** ${row.model}`,
    `**Stance:** ${row.stance}`,
    `**Status:** ${row.failed ? "Failed" : "Success"}`,
  ];
  if (row.failed && row.error_message) lines.push(`**Error:** ${row.error_message}`);
  lines.push("", "## Output", "", row.output ?? "_(no output)_");
  return lines.join("\n");
}

function buildVerdictMarkdown(row: RawVerdictRow): string {
  const label = roleLabel(row.role as AgentRole, row.name);
  const lines = [
    `# ${label}`,
    "",
    `**Model:** ${row.model}`,
    `**Status:** ${row.failed ? "Failed" : "Success"}`,
  ];
  if (row.failed && row.error_message) lines.push(`**Error:** ${row.error_message}`);
  if (!row.failed) {
    lines.push("", `**Verdict:** ${row.verdict_label ?? "(no structured verdict parsed)"}`);
    if (row.reasons?.length) lines.push("", "## Reasons", "", ...row.reasons.map((r) => `- ${r}`));
  }
  lines.push("", "## Full output", "", row.output ?? "_(no output)_");
  return lines.join("\n");
}

async function buildCaseZip(detail: RawCaseDetail): Promise<Blob> {
  const zip = new JSZip();
  zip.file("case.json", JSON.stringify(detail.case, null, 2));
  const advocates = zip.folder("advocates");
  for (const row of detail.advocateOutputs) {
    advocates?.file(`${row.role}.json`, JSON.stringify(row, null, 2));
    advocates?.file(`${row.role}.md`, buildAdvocateMarkdown(row));
  }
  const judges = zip.folder("judges");
  for (const row of detail.verdicts) {
    judges?.file(`${row.role}.json`, JSON.stringify(row, null, 2));
    judges?.file(`${row.role}.md`, buildVerdictMarkdown(row));
  }
  return zip.generateAsync({ type: "blob" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PAST_RUNS_PAGE_SIZE = 10;

// ─── Toast Component ──────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
  onSeeResults,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onSeeResults: () => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-icon">
            {t.type === "generating" && <span className="toast-spinner" />}
            {t.type === "retrying" && <span className="toast-spinner toast-spinner-retrying" />}
            {t.type === "success" && <CheckIcon />}
            {t.type === "error" && <CloseIcon size={14} />}
          </div>
          <div className="toast-body">
            {t.type === "success" ? (
              <span>
                {t.message}{" "}
                <button className="toast-link" onClick={onSeeResults}>
                  See results
                </button>
              </span>
            ) : (
              <span>{t.message}</span>
            )}
          </div>
          {(t.type === "error" || t.type === "retrying") && (
            <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
              <CloseIcon size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Results Modal ────────────────────────────────────────────────────────────

interface ResultsModalProps {
  caseDetail: CaseDetail;
  drafts: Record<AgentRole, AgentDraft>;
  overallVerdict: VerdictStance;
  onClose: () => void;
  onExport: () => void;
  onEditCurrentCase: () => void;
  onStartNewCase: () => void;
  zipEntry: { blob: Blob; sizeMb: string } | undefined;
  zipLoading: boolean;
  onHoverExport: () => void;
}

const DEFAULT_COL_WIDTHS = [100, 130, 240, 280, 140, 150, 110, 90];

function ResultsModal({
  caseDetail,
  drafts,
  overallVerdict,
  onClose,
  onExport,
  onEditCurrentCase,
  onStartNewCase,
  zipEntry,
  zipLoading,
  onHoverExport,
}: ResultsModalProps) {
  const [colWidths, setColWidths] = useState<number[]>([...DEFAULT_COL_WIDTHS]);

  function startResize(colIdx: number, e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colIdx];

    function onMove(mv: MouseEvent) {
      const delta = mv.clientX - startX;
      setColWidths((prev) => {
        const next = [...prev];
        next[colIdx] = Math.max(60, startW + delta);
        return next;
      });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  const verdictLabel =
    overallVerdict === "guilty"
      ? "Justified"
      : overallVerdict === "not-guilty"
      ? "Not Justified"
      : "Pending";

  const verdictClass =
    overallVerdict === "guilty"
      ? "modal-verdict-justified"
      : overallVerdict === "not-guilty"
      ? "modal-verdict-notjustified"
      : "modal-verdict-pending";

  const totalTokens = caseDetail.case.total_tokens;
  const totalCost = caseDetail.case.total_cost_usd;
  const totalTimeMs = caseDetail.case.total_time_ms;

  const tableRows: {
    role: AgentRole;
    roleLabel: string;
    name: string;
    inputPrompt: string;
    output: string | null;
    model: string;
    maxTokens: number;
    actualTokens: number | null;
    costUsd: number | null;
    durationMs: number | null;
    failed: boolean;
  }[] = ALL_ROLES.map((role) => {
    const isJudge = JUDGE_ROLES.includes(role);
    const draft = drafts[role];
    if (isJudge) {
      const v = caseDetail.verdicts.find((r) => r.role === role);
      return {
        role,
        roleLabel: ROLE_META[role].role,
        name: v?.name || draft.name || "—",
        inputPrompt: draft.systemPrompt,
        output: v
          ? v.failed
            ? `Failed: ${v.error_message}`
            : v.verdict_label
              ? `${v.verdict_label}\n\n${v.output ?? ""}`
              : v.output
          : null,
        model: v?.model || draft.model,
        maxTokens: draft.maxTokens,
        actualTokens: v?.total_tokens ?? null,
        costUsd: v?.cost_usd ?? null,
        durationMs: v?.duration_ms ?? null,
        failed: v?.failed ?? false,
      };
    } else {
      const a = caseDetail.advocateOutputs.find((r) => r.role === role);
      return {
        role,
        roleLabel: ROLE_META[role].role,
        name: a?.name || draft.name || "—",
        inputPrompt: draft.systemPrompt,
        output: a ? (a.failed ? `Failed: ${a.error_message}` : a.output) : null,
        model: a?.model || draft.model,
        maxTokens: draft.maxTokens,
        actualTokens: a?.total_tokens ?? null,
        costUsd: a?.cost_usd ?? null,
        durationMs: a?.duration_ms ?? null,
        failed: a?.failed ?? false,
      };
    }
  });

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-glass">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-title">Prompt Results</span>
            <span className={`modal-verdict-badge ${verdictClass}`}>{verdictLabel}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Charge sheet */}
        <div className="modal-charge-sheet">
          <div className="modal-section-label">Charge Sheet</div>
          <div className="modal-charge-text">{caseDetail.case.case_text}</div>
        </div>

        {/* Table */}
        <div className="modal-table-wrap">
          <table className="modal-table" style={{ tableLayout: "fixed", width: colWidths.reduce((a, b) => a + b, 0) }}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                {(["Role", "Name", "Input Prompt", "Output", "Model Used", "Max / Actual Tokens", "Cost (USD)", "Time"] as const).map((label, i) => (
                  <th key={label} style={{ position: "relative", userSelect: "none" }}>
                    {label}
                    {i < 7 && (
                      <span
                        className="col-resize-handle"
                        onMouseDown={(e) => startResize(i, e)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.role} className={row.failed ? "row-failed" : ""}>
                  <td>
                    <span className={`modal-role-tag modal-role-${ROLE_META[row.role].stance}`}>
                      {row.roleLabel}
                    </span>
                  </td>
                  <td>{row.name}</td>
                  <td>
                    <div className="cell-scroll">{row.inputPrompt || "—"}</div>
                  </td>
                  <td>
                    <div className="cell-scroll">{row.output ?? (row.failed ? "Failed" : "—")}</div>
                  </td>
                  <td className="cell-model">{row.model}</td>
                  <td className="cell-tokens">
                    {row.maxTokens} / {row.actualTokens != null ? row.actualTokens.toLocaleString() : "—"}
                  </td>
                  <td className="cell-cost">
                    {row.costUsd != null ? `$${Number(row.costUsd).toFixed(6)}` : "—"}
                  </td>
                  <td className="cell-time">
                    {row.durationMs != null ? `${(row.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Below table */}
        <div className="modal-below-table">
          <span className="modal-past-note">* The following results can be found in the past runs section</span>
          <div className="modal-totals">
            <span>{totalTokens != null ? totalTokens.toLocaleString() : "—"} tokens used this session</span>
            <span className="modal-total-cost">
              Total cost: <strong>${Number(totalCost ?? 0).toFixed(6)}</strong>
            </span>
            <span className="modal-total-time">
              Total time: <strong>{totalTimeMs != null ? `${(totalTimeMs / 1000).toFixed(1)}s` : "—"}</strong>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="modal-footer-left">
            <button
              className="modal-btn modal-btn-export"
              onMouseEnter={onHoverExport}
              onClick={onExport}
              title={zipLoading ? "Calculating size…" : zipEntry ? `File size: ${zipEntry.sizeMb} MB` : "Hover to calculate size"}
            >
              <DownloadIcon size={13} />
              <span>Export</span>
              <span className="modal-btn-size-hint">
                {zipLoading ? "…" : zipEntry ? `${zipEntry.sizeMb} MB` : ""}
              </span>
            </button>
            <button className="modal-btn modal-btn-edit" onClick={onEditCurrentCase}>
              <EditIcon />
              <span>Edit current case models</span>
            </button>
          </div>
          <div className="modal-footer-right">
            <button className="modal-btn modal-btn-new" onClick={onStartNewCase}>
              <PlusCircleIcon />
              <span>Start new case</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type RoleStatus = "idle" | "pending" | "running" | "retrying" | "done" | "failed" | "excluded";

// Pure so it can be called both from the render path (closing over `activeCase`
// state) and from pollRun's tick (with the just-fetched detail, before that
// state update has committed) to detect status transitions for live toasts.
function deriveRoleStatus(c: CaseDetail | null, role: AgentRole): RoleStatus {
  if (!c) return "idle";
  const isJudge = JUDGE_ROLES.includes(role);
  if (isJudge) {
    const row = c.verdicts.find((v) => v.role === role);
    if (row) return row.failed ? "failed" : "done";
    if (c.case.status !== "running") return "excluded";
    if (c.retrying?.[role]) return "retrying";
    const stage1Done = ADVOCATE_ROLES.every((r) => c.advocateOutputs.some((a) => a.role === r));
    return stage1Done ? "running" : "pending";
  }
  const row = c.advocateOutputs.find((a) => a.role === role);
  if (row) return row.failed ? "failed" : "done";
  if (c.case.status !== "running") return "excluded";
  if (c.retrying?.[role]) return "retrying";
  return "running";
}

export default function ConsolePage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caseText, setCaseText] = useState("");
  const [drafts, setDrafts] = useState<Record<AgentRole, AgentDraft> | null>(null);
  const [models, setModels] = useState<CuratedModel[]>([]);
  const [modelMode, setModelMode] = useState<"single" | "different">("single");
  const [singleModel, setSingleModel] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runTimedOut, setRunTimedOut] = useState(false);
  const [activeCase, setActiveCase] = useState<CaseDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number | null>(null);
  // Per-role status from the previous poll tick, so live per-role toasts
  // (retrying, failed) fire once on transition rather than every 1.5s.
  const prevRoleStatusRef = useRef<Partial<Record<AgentRole, RoleStatus>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Synchronous double-submit guard: `running` (React state) only takes
  // effect on the next render, which is fast but not instant — this ref is
  // checked-and-set in the same tick as the click, so even a scripted/rapid
  // double-fire can't start two runs before the state update commits.
  const isSubmittingRef = useRef(false);
  // Monotonic counter so a stale PUT /api/agent-config response from an
  // earlier "single model" apply can't clobber a newer selection.
  const modelApplyRef = useRef(0);

  const [pastRuns, setPastRuns] = useState<CaseSummary[]>([]);
  const [pastRunsOffset, setPastRunsOffset] = useState(0);
  const [hasMoreRuns, setHasMoreRuns] = useState(false);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);

  const [zipCache, setZipCache] = useState<Record<string, { blob: Blob; sizeMb: string }>>({});
  const [zipLoading, setZipLoading] = useState<Record<string, boolean>>({});

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  // Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const generatingToastIdRef = useRef<string | null>(null);

  // Results modal state
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [completedCase, setCompletedCase] = useState<CaseDetail | null>(null);
  const [lastRunDrafts, setLastRunDrafts] = useState<Record<AgentRole, AgentDraft> | null>(null);

  const addToast = useCallback((toast: Omit<ToastItem, "id">): string => {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  function dismissGeneratingToast() {
    if (generatingToastIdRef.current) {
      const id = generatingToastIdRef.current;
      setToasts((prev) => prev.filter((t) => t.id !== id));
      generatingToastIdRef.current = null;
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [configRes, modelsRes, casesRes] = await Promise.all([
          fetch("/api/agent-config"),
          fetch("/api/models"),
          fetch(`/api/cases?limit=${PAST_RUNS_PAGE_SIZE}`),
        ]);
        if (!configRes.ok) throw new Error(`Failed to load agent config (${configRes.status})`);
        if (!modelsRes.ok) throw new Error(`Failed to load models (${modelsRes.status})`);
        if (!casesRes.ok) throw new Error(`Failed to load past runs (${casesRes.status})`);

        const configJson = await configRes.json();
        const modelsJson = await modelsRes.json();
        const casesJson = await casesRes.json();

        const nextDrafts = {} as Record<AgentRole, AgentDraft>;
        // Initialize all roles with safe defaults first so drafts[role] is never undefined
        for (const role of ALL_ROLES) {
          nextDrafts[role] = {
            model: modelsJson.defaultModel ?? modelsJson.models?.[0]?.id ?? "",
            systemPrompt: "",
            maxTokens: ADVOCATE_ROLES.includes(role) ? 1200 : 1600,
            name: "",
          };
        }
        for (const row of configJson.agents ?? []) {
          const roleKey = row.role as AgentRole;
          if (!ALL_ROLES.includes(roleKey)) continue;
          nextDrafts[roleKey] = {
            ...nextDrafts[roleKey],
            model: row.model,
          };
        }
        setDrafts(nextDrafts);
        setModels(modelsJson.models ?? []);
        setSingleModel(modelsJson.defaultModel ?? modelsJson.models?.[0]?.id ?? "");
        setPastRuns(casesJson.cases ?? []);
        setHasMoreRuns(casesJson.hasMore ?? false);
        setPastRunsOffset(PAST_RUNS_PAGE_SIZE);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRuns) return;
    setLoadingMoreRuns(true);
    try {
      const res = await fetch(`/api/cases?limit=${PAST_RUNS_PAGE_SIZE}&offset=${pastRunsOffset}`);
      if (!res.ok) return;
      const json = await res.json();
      setPastRuns((prev) => [...prev, ...(json.cases ?? [])]);
      setHasMoreRuns(json.hasMore ?? false);
      setPastRunsOffset((prev) => prev + PAST_RUNS_PAGE_SIZE);
    } finally {
      setLoadingMoreRuns(false);
    }
  }, [loadingMoreRuns, pastRunsOffset]);

  function retireFinishedCase() {
    if (!running) {
      if (activeCase) setActiveCase(null);
      if (completedCase) setCompletedCase(null);
    }
  }

  function handleLoadExampleTemplate() {
    retireFinishedCase();
    setCaseText(SEED_CASE_TEXT);
    setDrafts((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const role of ALL_ROLES) {
        next[role] = {
          ...next[role],
          systemPrompt: AGENT_SYSTEM_PROMPTS[role as keyof typeof AGENT_SYSTEM_PROMPTS] ?? next[role].systemPrompt,
          name: EXAMPLE_NAMES[role],
        };
      }
      return next;
    });
  }

  function updateDraft(role: AgentRole, patch: Partial<AgentDraft>) {
    retireFinishedCase();
    setDrafts((prev) => {
      if (!prev) return prev;
      return { ...prev, [role]: { ...prev[role], ...patch } };
    });
  }

  async function handleSingleModelChange(modelId: string) {
    // Stale-response guard: if the dropdown changes again before this batch
    // of 7 PUTs lands, a late response here must not clobber the newer
    // selection's state.
    const requestId = ++modelApplyRef.current;

    setModelMode("single");
    setSingleModel(modelId);
    if (!drafts) return;
    for (const role of ALL_ROLES) {
      updateDraft(role, { model: modelId });
    }
    setSaveError(null);
    try {
      await Promise.all(
        ALL_ROLES.map(async (role) => {
          const draft = drafts[role];
          const res = await fetch(`/api/agent-config/${role}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId, systemPrompt: draft.systemPrompt, maxTokens: draft.maxTokens }),
          });
          if (!res.ok) throw new Error(`Failed to apply model to ${role}`);
          const body = await res.json();
          if (requestId !== modelApplyRef.current) return; // a newer call superseded this one
          setDrafts((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              [role]: {
                ...prev[role],
                model: body.agent.model,
                systemPrompt: body.agent.system_prompt,
                maxTokens: body.agent.max_tokens,
              },
            };
          });
        })
      );
    } catch (err) {
      if (requestId === modelApplyRef.current) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  const canRun = useMemo(() => {
    if (!drafts) return false;
    if (!caseText.trim()) return false;
    const allPromptsSet = ALL_ROLES.every((role) => drafts[role]?.systemPrompt?.trim());
    const allNamesSet = ALL_ROLES.every((role) => drafts[role]?.name?.trim());
    return allPromptsSet && allNamesSet;
  }, [drafts, caseText]);

  function resolveJudgeStance(v: { failed: boolean; verdict_label: string | null; output: string | null }): VerdictStance {
    if (v.failed) return "unknown";
    // Primary: use the parsed verdict label from the VERDICT: trailer
    const fromLabel = verdictStance(v.verdict_label);
    if (fromLabel !== "unknown") return fromLabel;
    // Fallback: scan the last ~300 chars of the full output for verdict keywords
    if (v.output) {
      const tail = v.output.slice(-300);
      return verdictStance(tail);
    }
    return "unknown";
  }

  const overallVerdict = useMemo((): VerdictStance => {
    if (!activeCase) return "unknown";
    const stances = activeCase.verdicts.map(resolveJudgeStance);
    const guiltyCount = stances.filter((s) => s === "guilty").length;
    const notGuiltyCount = stances.filter((s) => s === "not-guilty").length;
    const majority = Math.ceil(JUDGE_ROLES.length / 2);
    if (guiltyCount >= majority) return "guilty";
    if (notGuiltyCount >= majority) return "not-guilty";
    return "unknown";
  }, [activeCase]);

  const completedCaseVerdict = useMemo((): VerdictStance => {
    if (!completedCase) return "unknown";
    const stances = completedCase.verdicts.map(resolveJudgeStance);
    const guiltyCount = stances.filter((s) => s === "guilty").length;
    const notGuiltyCount = stances.filter((s) => s === "not-guilty").length;
    const majority = Math.ceil(JUDGE_ROLES.length / 2);
    if (guiltyCount >= majority) return "guilty";
    if (notGuiltyCount >= majority) return "not-guilty";
    return "unknown";
  }, [completedCase]);

  function handleReset() {
    setActiveCase(null);
    setCompletedCase(null);
    setLastRunDrafts(null);
    setCaseText("");
    setRunError(null);
    setRunTimedOut(false);
    setShowResultsModal(false);
    setDrafts((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const role of ALL_ROLES) {
        next[role] = { ...next[role], systemPrompt: "", name: "" };
      }
      return next;
    });
  }

  async function handleRun() {
    if (!drafts) return;
    if (isSubmittingRef.current) {
      const id = addToast({ type: "error", message: RUN_ALREADY_ACTIVE });
      setTimeout(() => removeToast(id), 5000);
      return;
    }
    isSubmittingRef.current = true;
    setRunError(null);
    setRunTimedOut(false);
    setRunning(true);
    setActiveCase(null);
    setCompletedCase(null);
    setShowResultsModal(false);

    // Snapshot prompts used for this run
    setLastRunDrafts({ ...drafts });

    // Show persistent generating toast
    const toastId = addToast({ type: "generating", message: "Generating... please do not close the app" });
    generatingToastIdRef.current = toastId;

    const agents = ALL_ROLES.map((role) => {
      const draft = drafts[role];
      return { role, model: draft.model, systemPrompt: draft.systemPrompt, maxTokens: draft.maxTokens, name: draft.name };
    });

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseText, agents }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Run failed to start (${res.status})`);
      }
      const { caseId } = await res.json();
      pollRun(caseId);
    } catch (err) {
      dismissGeneratingToast();
      const errMsg = err instanceof Error ? err.message : String(err);
      setRunError(errMsg);
      setRunning(false);
      isSubmittingRef.current = false;
      const errToastId = addToast({ type: "error", message: errMsg });
      setTimeout(() => removeToast(errToastId), 8000);
    }
  }

  function pollRun(caseId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollStartRef.current = Date.now();
    prevRoleStatusRef.current = {};

    const tick = async () => {
      if (pollStartRef.current && Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setRunTimedOut(true);
      }

      try {
        const res = await fetch(`/api/cases/${caseId}`);
        if (!res.ok) return;
        const detail: CaseDetail = await res.json();
        setActiveCase(detail);

        // Per-role live toasts: fire once on transition into "retrying" or
        // "failed", not on every poll tick — see docs/toast-message-copy.md
        // (name the specific role, two-part "what happened, what's next").
        for (const role of ALL_ROLES) {
          const prevStatus = prevRoleStatusRef.current[role];
          const nextStatus = deriveRoleStatus(detail, role);
          prevRoleStatusRef.current[role] = nextStatus;
          if (nextStatus === prevStatus) continue;

          if (nextStatus === "retrying") {
            const info = detail.retrying?.[role];
            const label = roleLabel(role, drafts?.[role]?.name);
            const message = info
              ? agentRetryMessage({ roleLabel: label, code: info.code, nextAttempt: info.attempt, maxAttempts: info.maxAttempts })
              : agentRetryingFallback(label);
            const id = addToast({ type: "retrying", message });
            setTimeout(() => removeToast(id), 6000);
          } else if (nextStatus === "failed") {
            const isJudge = JUDGE_ROLES.includes(role);
            const row = isJudge ? detail.verdicts.find((v) => v.role === role) : detail.advocateOutputs.find((a) => a.role === role);
            const message = row?.error_message ?? agentFailedFallback(roleLabel(role, drafts?.[role]?.name));
            const id = addToast({ type: "error", message });
            setTimeout(() => removeToast(id), 8000);
          }
        }

        if (detail.case.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          setRunning(false);
          isSubmittingRef.current = false;
          setRunTimedOut(false);

          // Dismiss generating toast
          dismissGeneratingToast();

          if (detail.case.status === "failed" || detail.case.status === "partial-failure") {
            const anyFailedRowLanded = [...detail.advocateOutputs, ...detail.verdicts].some((r) => r.failed);
            if (detail.case.status === "partial-failure") {
              // Per-role failures already toasted above as they landed —
              // this is just the run-level summary. Denominator is the
              // number of calls actually made, not a hardcoded 7 — a judge
              // with an empty prompt is silently excluded from a run (§4.1),
              // so fewer than 7 calls can legitimately happen.
              const totalCalls = detail.advocateOutputs.length + detail.verdicts.length;
              const failedCount = [...detail.advocateOutputs, ...detail.verdicts].filter((r) => r.failed).length;
              setCompletedCase(detail);
              const id = addToast({ type: "success", message: `Generation completed — ${failedCount} of ${totalCalls} calls failed.` });
              setTimeout(() => removeToast(id), 10000);
            } else if (!anyFailedRowLanded) {
              // Edge case: every write for this run was dead-lettered (see
              // specs/error-handling.md) — no per-role row ever landed to
              // toast individually, so fall back to a generic message.
              const id = addToast({ type: "error", message: "This run failed and nothing could be saved. Check the server logs." });
              setTimeout(() => removeToast(id), 8000);
            }
            // else: fully "failed" with landed rows — each was already toasted above.
          } else {
            // complete — store completed case and show success toast
            setCompletedCase(detail);
            const successToastId = addToast({ type: "success", message: "Generation completed." });
            setTimeout(() => removeToast(successToastId), 10000);
          }

          setPastRuns((prev) => {
            if (prev.some((r) => r.id === detail.case.id)) return prev;
            return [
              {
                id: detail.case.id,
                case_text: detail.case.case_text,
                submitted_at: detail.case.submitted_at,
                status: detail.case.status,
                total_tokens: detail.case.total_tokens,
                total_cost_usd: detail.case.total_cost_usd,
                total_time_ms: detail.case.total_time_ms,
              },
              ...prev,
            ];
          });
        }
      } catch {
        // transient — next tick will retry
      }
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
  }

  async function ensureCaseZip(id: string): Promise<{ blob: Blob; sizeMb: string } | null> {
    if (zipCache[id]) return zipCache[id];
    if (zipLoading[id]) return null;
    setZipLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (!res.ok) return null;
      const detail = (await res.json()) as RawCaseDetail;
      const blob = await buildCaseZip(detail);
      const entry = { blob, sizeMb: (blob.size / (1024 * 1024)).toFixed(2) };
      setZipCache((prev) => ({ ...prev, [id]: entry }));
      return entry;
    } catch {
      return null;
    } finally {
      setZipLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleDownloadRun(id: string) {
    const entry = await ensureCaseZip(id);
    if (entry) downloadBlob(entry.blob, `tribunal-case-${id.slice(0, 8)}.zip`);
  }

  function handleExport() {
    if (!activeCase) return;
    const blob = new Blob([JSON.stringify(activeCase, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tribunal-case-${activeCase.case.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploadNotice(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // body.error is already a rule-compliant sentence (docs/toast-message-copy.md) —
        // don't append internal field names or raw model output to it.
        throw new Error(body.error ?? "Upload failed. Try again or enter fields manually.");
      }

      const fields = body.fields as Record<string, string>;
      setCaseText(fields.caseText ?? caseText);
      setDrafts((prev) => {
        if (!prev) return prev;
        const promptMap: Record<string, AgentRole> = {
          defense1: "defense-1",
          defense2: "defense-2",
          prosecution1: "prosecution-1",
          prosecution2: "prosecution-2",
          judge1: "judge-1",
          judge2: "judge-2",
          judge3: "judge-3",
        };
        const nameMap: Record<string, AgentRole> = {
          defense1Name: "defense-1",
          defense2Name: "defense-2",
          prosecution1Name: "prosecution-1",
          prosecution2Name: "prosecution-2",
          judge1Name: "judge-1",
          judge2Name: "judge-2",
          judge3Name: "judge-3",
        };
        const next = { ...prev };
        for (const [key, role] of Object.entries(promptMap)) {
          if (fields[key]) next[role] = { ...next[role], systemPrompt: fields[key] };
        }
        for (const [key, role] of Object.entries(nameMap)) {
          if (fields[key]) next[role] = { ...next[role], name: fields[key] };
        }
        return next;
      });
      setUploadNotice("Drafts and agent names loaded from upload — review each panel and fill any missing names before running.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function roleStatus(role: AgentRole): RoleStatus {
    return deriveRoleStatus(activeCase, role);
  }

  // The classified, browser-safe failure reason for a role that's already
  // landed (advocate_outputs/verdicts.error_message — sanitized server-side,
  // see lib/orchestrator/run.ts) — never a raw exception message.
  function roleErrorMessage(role: AgentRole): string | null {
    const c = activeCase;
    if (!c) return null;
    const isJudge = JUDGE_ROLES.includes(role);
    const row = isJudge ? c.verdicts.find((v) => v.role === role) : c.advocateOutputs.find((a) => a.role === role);
    return row?.failed ? row.error_message : null;
  }

  if (loading) return <main><p>Loading…</p></main>;
  if (loadError || !drafts) {
    return (
      <main>
        <div className="error-banner">Failed to load: {loadError}</div>
        <p className="hint" style={{ color: "#d6cdb8" }}>Check that SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set in .env.local and the schema from supabase/migrations/0001_init.sql has been run, then seeded with `npm run seed`.</p>
      </main>
    );
  }

  const showSeeResultsBreadcrumb = completedCase !== null && !running;

  function renderAgentCard(role: AgentRole) {
    const draft = drafts![role];
    const status = roleStatus(role);
    const retryInfo = activeCase?.retrying?.[role];
    const errorMessage = roleErrorMessage(role);
    const stance = ROLE_META[role].stance;
    const dropdownDisabled = modelMode === "single";
    const statusLabel = status === "retrying" && retryInfo ? `retrying ${retryInfo.attempt}/${retryInfo.maxAttempts}` : status;

    return (
      <div key={role} className={`agent-card-frame ${stance} status-${status}`}>
        <div className={`panel agent-card ${stance}`}>
          <div className="agent-panel-header-new">
            <span className={`role-icon ${stance}`}><ROLE_ICON stance={stance} /></span>
            <div className="role-titles">
              <span className="role-title">{ROLE_META[role].role}</span>
              <span className="role-name">{draft.name || <em style={{ opacity: 0.5 }}>No name set</em>}</span>
              <span className="role-subtitle">{ROLE_SUBTITLE[role]}</span>
            </div>
            {status !== "idle" && (
              <div style={{ marginLeft: "auto" }}>
                {status === "failed" && errorMessage ? (
                  <span className="info-tooltip-anchor">
                    <button type="button" className="status-badge failed status-badge-btn clickable" tabIndex={0}>
                      failed
                    </button>
                    <span className="info-tooltip-text">{errorMessage}</span>
                  </span>
                ) : (
                  <span className={`status-badge ${status}`}>{statusLabel}</span>
                )}
              </div>
            )}
          </div>

          <label>
            Name <span style={{ color: "#c0a060", marginLeft: 2 }}>*</span>
          </label>
          <input
            type="text"
            value={draft.name}
            placeholder={
              stance === "defense"
                ? "e.g. Jane Doe — Defense Counsel"
                : stance === "prosecution"
                ? "e.g. John Smith — State Prosecutor"
                : "e.g. Ruth Bader Ginsburg — Presiding Judge"
            }
            onChange={(e) => updateDraft(role, { name: e.target.value })}
          />

          <label>Model</label>
          <select
            value={draft.model}
            disabled={dropdownDisabled}
            onChange={(e) => updateDraft(role, { model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          <label>
            System prompt <span style={{ color: "#c0a060", marginLeft: 2 }}>*</span>
          </label>
          <textarea
            value={draft.systemPrompt}
            placeholder={
              stance === "defense"
                ? "Define this defense advocate's identity, legal philosophy, and argumentation style.\n\nExample: You are [Name], a defense attorney known for [approach]. Your role is to challenge the prosecution's evidence and argue for the defendant's acquittal. You emphasise [legal principles]…"
                : stance === "prosecution"
                ? "Define this prosecutor's identity, legal philosophy, and argumentation style.\n\nExample: You are [Name], a state prosecutor with a reputation for [approach]. Your role is to prove the defendant's guilt beyond reasonable doubt. You focus on [legal principles]…"
                : "Define this judge's background, legal philosophy, and decision-making approach.\n\nExample: You are [Name], a [court/background] judge known for [judicial philosophy]. You assess arguments impartially, weigh evidence carefully, and deliver a reasoned verdict of Guilty or Not Guilty…"
            }
            onChange={(e) => updateDraft(role, { systemPrompt: e.target.value })}
            rows={6}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" className="clear-btn" disabled={!draft.systemPrompt.trim()} onClick={() => updateDraft(role, { systemPrompt: "" })}>Clear</button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Max tokens
            <span className="info-tooltip-anchor">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55, cursor: "default", flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="8" />
                <line x1="12" y1="12" x2="12" y2="16" />
              </svg>
              <span className="info-tooltip-text">
                Tokens are the unit the model counts internally — roughly 1.5 tokens per word.
                <br /><br />
                Default: advocates 1,200 tokens ≈ 800 words, judges 1,600 tokens ≈ 1,067 words.
              </span>
            </span>
          </label>
          <input
            type="number"
            min={1}
            value={draft.maxTokens}
            onChange={(e) => updateDraft(role, { maxTokens: Number(e.target.value) })}
          />

        </div>
      </div>
    );
  }

  return (
    <main>
      {/* Toast notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={removeToast}
        onSeeResults={() => setShowResultsModal(true)}
      />

      {/* Results modal */}
      {showResultsModal && completedCase && lastRunDrafts && (
        <ResultsModal
          caseDetail={completedCase}
          drafts={lastRunDrafts}
          overallVerdict={completedCaseVerdict}
          onClose={() => setShowResultsModal(false)}
          onExport={() => handleDownloadRun(completedCase.case.id)}
          onEditCurrentCase={() => { setShowResultsModal(false); setCompletedCase(null); }}
          onStartNewCase={handleReset}
          zipEntry={zipCache[completedCase.case.id]}
          zipLoading={!!zipLoading[completedCase.case.id]}
          onHoverExport={() => ensureCaseZip(completedCase.case.id)}
        />
      )}

      <nav className="topbar">
        <div className="topbar-brand">
          <span className="logo-icon"><BuildingIcon /></span>
          <span className="brand-name">TRIBUNAL</span>
          <span className="brand-sub">Case Workspace</span>
        </div>
      </nav>

      <div className="hero">
        <div className="hero-icon"><BuildingIcon /></div>
        <h1>The Tribunal</h1>
        <div className="ornate-divider"><span className="line" /><span className="dot" /><span className="line" /></div>
      </div>

      <section>
        <div className="section-heading-row">
          <h2 style={{ margin: 0 }}>
            Charge Sheet <span style={{ color: "#c0a060", marginLeft: 2 }}>*</span>
          </h2>
        </div>
        <div className="panel" style={{ marginTop: 10 }}>
          <textarea
            value={caseText}
            placeholder={"Describe the case: the charge, the parties involved, the agreed facts, and the legal question to be decided.\n\nExample:\nCase T-001: The State v. [Defendant]\nCharge: [Alleged offence]\nAgreed facts: …\nLegal question: …\n\nYou can also upload a PDF dossier to auto-fill all fields."}
            onChange={(e) => {
              retireFinishedCase();
              setCaseText(e.target.value);
            }}
            rows={10}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <button type="button" className="breadcrumb-btn" onClick={handleLoadExampleTemplate}>
              Load Example Case
            </button>
            <button type="button" className="clear-btn" disabled={!caseText.trim()} onClick={() => setCaseText("")}>Clear</button>
          </div>
        </div>
      </section>

      <div className="two-col-row">
        <section className="col">
          <h2>Upload dossier</h2>
          <div className="panel upload-panel">
            <div
              className="upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleUpload(f);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                disabled={uploading}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
              <DownloadIcon />
              <p className="upload-text"><strong>Choose a file</strong> or drag it here.</p>
            </div>
            <label>.pdf only, max 5MB — pre-fills charge sheet, system prompts and agent names</label>
            {uploading && <span className="hint">Extracting…</span>}
            {uploadError && <div className="error-banner">{uploadError}</div>}
            {uploadNotice && <p className="hint">{uploadNotice}</p>}
          </div>
        </section>

        <section className="col">
          <h2>Model selection</h2>
          <div className="panel">
            <div className="model-mode-row">
              <label className="mode-option">
                <input type="radio" checked={modelMode === "single"} onChange={() => handleSingleModelChange(singleModel)} />
                <span className="radio" />
                <span className="mode-option-text">Single model for all</span>
              </label>
              <label className="mode-option">
                <input type="radio" checked={modelMode === "different"} onChange={() => setModelMode("different")} />
                <span className="radio" />
                <span className="mode-option-text">Different model for all (manual pick)</span>
              </label>
            </div>
            <select
              value={singleModel}
              onChange={(e) => handleSingleModelChange(e.target.value)}
              disabled={modelMode === "different"}
              style={{ marginTop: 10, opacity: modelMode === "different" ? 0.45 : 1 }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {saveError && <div className="error-banner" style={{ marginTop: 10 }}>{saveError}</div>}
          </div>
        </section>
      </div>

      <section>
        <div className="section-divider">
          <span className="line" />
          <span className="label">Advocates</span>
          <span className="line" />
        </div>
        <div className="agent-grid">{ADVOCATE_ROLES.map((role) => renderAgentCard(role))}</div>

        <div className="section-divider">
          <span className="line" />
          <span className="icon"><ScaleIcon /></span>
          <span className="label">Judges&rsquo; Panel</span>
          <span className="line" />
        </div>
        <div className="agent-grid">{JUDGE_ROLES.map((role) => renderAgentCard(role))}</div>
      </section>

      <section>
        <div className="run-row">
          <div className="generate-row">
            <div className={`btn-tooltip-wrapper${!canRun && !running ? " show-tooltip" : ""}`}>
              <div className="btn-wrapper">
                <button
                  className={`btn ${running ? "is-loading" : ""}`}
                  onClick={handleRun}
                  disabled={!canRun || running}
                >
                  <GenerateIcon />
                  <span className="txt-wrapper">
                    <span className="txt-1">{letterSpans("Generate", "g")}</span>
                    <span className="txt-2">{letterSpans("Generating", "i")}</span>
                  </span>
                </button>
              </div>
              <span className="btn-disabled-tooltip">All required fields must be filled</span>
            </div>
            {running && <span className="btn-loader" aria-label="Generating" />}

            {/* See Results button — appears after generation completes */}
            {showSeeResultsBreadcrumb && (
              <div className="btn-wrapper see-results-breadcrumb">
                <button
                  type="button"
                  className="btn btn-results"
                  onClick={() => setShowResultsModal(true)}
                >
                  <EyeIcon className="btn-svg" />
                  <span className="btn-results-label">
                    {letterSpans("See", "sr1")}
                    <span className="btn-word-gap" aria-hidden="true" />
                    {letterSpans("results", "sr2")}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        {runError && <div className="error-banner">{runError}</div>}
        {runTimedOut && (
          <div className="error-banner" style={{ background: "rgba(180,100,0,0.15)", borderColor: "rgba(180,100,0,0.4)" }}>
            The run is taking longer than expected (over 5 minutes). The pipeline may still be processing in the background — check Past Runs later for results, or wait here.
          </div>
        )}
      </section>


      <section>
        <h2>Past runs</h2>
        <div className="panel">
          {pastRuns.length === 0 && <p className="hint">No completed runs yet.</p>}
          <div className="past-runs-scroll">
            {pastRuns.map((c) => (
              <div key={c.id} className="past-run-row">
                <span className={`status-badge ${c.status}`}>{c.status}</span>
                <span className="past-run-preview">{c.case_text}</span>
                <span className="hint">{new Date(c.submitted_at).toLocaleString()}</span>
                <span className="hint past-run-meta">
                  {c.total_tokens != null ? c.total_tokens.toLocaleString() : "—"} tok
                  {" · "}${Number(c.total_cost_usd ?? 0).toFixed(4)}
                  {" · "}
                  {c.total_time_ms != null ? `${(c.total_time_ms / 1000).toFixed(1)}s` : "—"}
                </span>
                <button
                  type="button"
                  className="Btn"
                  aria-label="Download run as zip"
                  onMouseEnter={() => ensureCaseZip(c.id)}
                  onClick={() => handleDownloadRun(c.id)}
                >
                  <svg className="svgIcon" viewBox="0 0 384 512" height="16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.7V56c0-13.3-10.7-24-24-24s-24 10.7-24 24V370.7L70.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l144 144z" />
                  </svg>
                  <div className="icon2" />
                  <span className="tooltip">
                    {zipLoading[c.id] ? "Calculating…" : zipCache[c.id] ? `${zipCache[c.id].sizeMb} MB` : "Hover to check size"}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {hasMoreRuns && (
            <button
              type="button"
              className="secondary"
              style={{ marginTop: 10, width: "100%" }}
              onClick={handleLoadMore}
              disabled={loadingMoreRuns}
            >
              {loadingMoreRuns ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
