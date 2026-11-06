---
name: final-readiness-delivery
description: Prepare `outputs/final-client-delivery-draft.md` from approved final readiness outputs.
---

# Final readiness delivery

## Purpose

Prepare `outputs/final-client-delivery-draft.md` from approved final readiness outputs.

## Required inputs

- Project ID and approved final readiness outputs.

## Optional inputs

- Approved package index, delivery requirements, and previously approved delivery draft.

## Allowed actions

1. Read approved final readiness outputs and verify that each referenced deliverable exists.
2. Summarize the readiness package and identify its contents without overstating outcomes.
3. Include the explicit statement: ?The agency provides certification-readiness preparation only. This delivery does not constitute certification; certification decisions are made by an independent certification body.?
4. Create `outputs/final-client-delivery-draft.md` and label it as an unsent draft.

## Prohibited actions

- Sending or uploading the delivery automatically.
- Saying or implying the client is certified, passed certification, or is guaranteed certification.
- Including unapproved or nonexistent outputs.

## Expected outputs

- `outputs/final-client-delivery-draft.md`
- A concise run record that identifies the artifact path and any blocker without copying confidential client details.

## Project path conventions

The project root is `D:\AgentOps\agency\projects\<project-id>`. Use only the supplied or already established project ID. Standard directories are `client-input`, `working`, and `outputs`. Resolve paths beneath that project root and never traverse outside it. Do not invent an ID. If the ID or project root is unavailable, stop dependent work and record a blocker.

## Completion criteria

The owned output exists at its specified path, is readable, meets the routine-specific content requirements, separates sourced information from uncertainty, and is recorded in the run log. A partial artifact must be reported as partial.

## Failure and blocker behavior

Do not change source evidence or another routine's files. If required inputs, permissions, or approvals are missing, preserve existing artifacts, state the specific blocker and relevant local path, and complete only independent authorized work. Never fabricate a fallback fact. Do not send or upload communications.

## Routine-specific completion criteria

Every listed output is approved and present, the required readiness-only statement is included, and no certification claim appears.
