// Best-effort VERDICT: / REASONS: trailer parsing, per TRIBUNAL_REQUIREMENTS.md §4.4.
// A judge that answers without this exact trailer still counts as a successful
// call — callers must treat a null verdictLabel as "no structured verdict
// parsed", never as a failure and never as a guessed verdict.

export interface ParsedVerdict {
  verdictLabel: string | null;
  reasons: string[] | null;
}

export function parseVerdict(output: string): ParsedVerdict {
  const verdictMatch = output.match(/VERDICT:\s*(.+)/i);
  const reasonsMatch = output.match(/REASONS:\s*([\s\S]+)/i);

  const verdictLabel = verdictMatch ? verdictMatch[1].trim().split("\n")[0].trim() : null;

  let reasons: string[] | null = null;
  if (reasonsMatch) {
    reasons = reasonsMatch[1]
      .split("\n")
      .map((line) => line.replace(/^[\s\-*•\d.]+/, "").trim())
      .filter((line) => line.length > 0);
    if (reasons.length === 0) reasons = null;
  }

  return { verdictLabel, reasons };
}
