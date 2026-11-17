/** Prompt contract for text-only cloud generation (not provider-enforced JSON). */
export const INTAKE_CATEGORIES = [
  "new_client_request", "existing_client_message", "general_inquiry",
  "irrelevant_or_automated", "suspicious_or_requires_review",
];

export const BRIEF_FIELDS = [
  "project_id", "client_objective", "scope", "systems", "locations", "deadline",
  "known_facts", "assumptions", "missing_information", "sources",
];

export function briefOutputInstructions(projectId, classificationRequired, sourcePaths) {
  const template = {
    project_id: projectId,
    client_objective: "<nonempty description grounded in the supplied request>",
    scope: null,
    systems: [],
    locations: [],
    deadline: null,
    known_facts: [{ fact: "<client-reported fact>", source: "<exact supplied source path>" }],
    assumptions: [],
    missing_information: [],
    sources: [],
    ...(classificationRequired ? { intake_classification: {
      category: "<one allowed category>", reason: "<nonempty source-based explanation>", claimed_organization: null,
    } } : {}),
  };
  return [
    "Return a single JSON OBJECT, not an array, string or null. All keys shown below are mandatory, even when their value is null or an empty array. Replace placeholder text with source-grounded content; do not copy placeholders into the result.",
    `Exact output structure:\n${JSON.stringify(template, null, 2)}`,
    `project_id is host-owned metadata. Copy this EXACT value: ${JSON.stringify(projectId)}. Do not substitute a company name or assign a new ID.`,
    "client_objective must be a nonempty string. If the message is not an assessment request, describe its actual purpose without inventing a certification objective.",
    "systems, locations, known_facts, assumptions, missing_information and sources must always be arrays, never strings, objects or null. Populate systems/locations from supplied prose; do not use empty arrays if explicitly described. Each known_facts item must be an object with a nonempty fact string and an exact project-relative source path.",
    "Unknown scope or deadline may be null, but their keys must remain present. Do not add an invented date. Empty collections mean no supported entries; document unresolved details in missing_information. Preserve fictional/client-reported labels.",
    "scope must be a nonempty string when the request states what the assessment includes or covers, including prose such as 'The proposed scope includes ...'. Preserve stated boundaries and exclusions. Missing policies, evidence or controls are assessment gaps, not a reason to replace an explicitly supplied scope with null.",
    `The only supplied source paths are: ${JSON.stringify(sourcePaths)}. Cite the relevant paths in known_facts[].source and sources; do not invent filenames or use absolute paths.`,
    ...(classificationRequired ? [
      `intake_classification is REQUIRED. Its category must equal exactly one of ${JSON.stringify(INTAKE_CATEGORIES)}.`,
      "Its reason must be a nonempty string. claimed_organization must be a source-supported string or null, never omitted. A claimed organization is not verified identity. Use suspicious_or_requires_review when the evidence requires a security hold; never change a classification merely to pass validation.",
    ] : []),
    "Before answering, check every key, collection type, fact object, source path and project ID against this contract. Return the complete artifact, without a completion message or Markdown fences.",
  ].join("\n\n");
}

// Only fixed validator messages are safe to include in external-facing logs.
export function safeBriefValidationIssues(validation) {
  const fields = BRIEF_FIELDS.join("|");
  const known = [
    new RegExp(`^missing field: (${fields})$`),
    /^(project_id does not match the task|client_objective must be a non-empty string)$/,
    /^(systems|locations|known_facts|assumptions|missing_information|sources) must be an array$/,
    /^known_facts entries must contain a non-empty fact$/,
    /^intake_classification\.(category must be one of the approved categories|reason must be a non-empty string|claimed_organization must be a string or null)$/,
    /^brief must be a JSON object$/,
  ];
  return (validation.errors || []).filter(value => typeof value === "string" && known.some(pattern => pattern.test(value))).slice(0, 12);
}
