# Useful work and recovery

This shared work-cycle guidance applies after an eligible guard result. It refines work selection and progress reporting without changing role limits, project boundaries, evidence requirements, PAUSED behavior, or the no-send rule. Read the matching routine entry in `work-profile.json`.

## Work selection

Read the current project status, the routine's owned inputs, the latest progress receipt, and the source evidence needed for the next step. Complete a useful unit within the routine's scope. Do not take over another routine's output or the Project Manager's decisions. Missing inputs do not prevent independent permitted work, but they do prevent unsupported conclusions.

Before recording a blocker, verify it against current authorized project files. Record the blocked step, kind, owner if known, evidence path, verification date, next action, and checkpoint. Do not ask the client to resend a document that is already present and readable. If no useful authorized work remains, record a quiet outcome and the next checkpoint.

## Progress evidence

Progress receipts are immutable under `progress/<routine-id>/*.json`. Use `node scripts/work-cycle.mjs record --file <input>` when a receipt is appropriate. The artifact must exist and meet its acceptance criteria; a hash alone does not establish quality. Keep client names, personal data, credentials, and confidential evidence out of run records and progress summaries. Reference project-local paths instead.

On guard skips, do not write a progress receipt. Keep execution status, delivery status, and business outcome distinct. Missing receipts are unknown, not successful. Preserve prior receipts and report missing evidence rather than fabricating it.

## Handoffs and recovery

The `project-handoff` routine creates the project's local handoff artifact for the Project Manager. This is a file handoff only, not an external message or a claim of acceptance. Revalidate source dates and approval status before resuming interrupted work. Preserve the guard claim token and use `scripts/run-state.mjs` to finish the claim as completed or partial. Never close another routine's claim.
