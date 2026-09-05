// Shared 15-field case/cast schema used by both /api/extract (dossier upload)
// and /api/generate-case (AI generation) — see docs/plans/advocates-judges-avatar-list.md
// §1. Both routes produce/consume the same shape: one case-text field plus a
// name + profile pair for each of the 7 roles. The object is a fixed set of
// keys (not an array), which is what makes "an 8th role" or "a name landing
// in the wrong seat" structurally impossible — the model can't emit a key
// that doesn't already correspond to exactly one seat.
//
// All 15 fields (not just the 8 profile fields) are required for a result to
// count as usable: a response missing a name is rejected the same way a
// response missing a profile is, never silently left blank.

export const REQUIRED_CONTENT_KEYS = ["caseText", "defense1", "defense2", "prosecution1", "prosecution2", "judge1", "judge2", "judge3"] as const;
export const NAME_KEYS = ["defense1Name", "defense2Name", "prosecution1Name", "prosecution2Name", "judge1Name", "judge2Name", "judge3Name"] as const;
export const ALL_FIELD_KEYS = [...REQUIRED_CONTENT_KEYS, ...NAME_KEYS] as const;

const CONTENT_FIELD_MAX_CHARS = 8000;
const NAME_FIELD_MAX_CHARS = 200;

export function maxCharsFor(key: string): number {
  return (NAME_KEYS as readonly string[]).includes(key) ? NAME_FIELD_MAX_CHARS : CONTENT_FIELD_MAX_CHARS;
}

// Constrains the response to exactly these 15 string fields, so untrusted
// input (a dossier's content, or a generation hint) can't smuggle extra
// keys/directives into the shape of the response.
export const CASE_FIELDS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "case_fields",
    strict: true,
    schema: {
      type: "object",
      properties: Object.fromEntries(ALL_FIELD_KEYS.map((key) => [key, { type: "string" }])),
      required: [...ALL_FIELD_KEYS],
      additionalProperties: false,
    },
  },
};

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

export interface CaseFieldsValidation {
  success: boolean;
  emptyKeys: string[];
  oversizedKeys: string[];
}

// A field that blows past its length cap is a signal something's off (e.g.
// the model got steered into dumping unrelated/injected content into one
// field) — flagged and rejected, never silently truncated.
export function validateCaseFields(parsed: Record<string, string>): CaseFieldsValidation {
  const emptyKeys = ALL_FIELD_KEYS.filter((k) => !(typeof parsed[k] === "string" && parsed[k].trim().length > 0));
  const oversizedKeys = ALL_FIELD_KEYS.filter((k) => typeof parsed[k] === "string" && parsed[k].length > maxCharsFor(k));
  return { success: emptyKeys.length === 0 && oversizedKeys.length === 0, emptyKeys, oversizedKeys };
}
