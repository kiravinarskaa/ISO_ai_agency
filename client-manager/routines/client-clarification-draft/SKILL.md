---
name: client-clarification-draft
description: Prepare concise questions for the client from `working/missing-information.md` in `working/client-clarification-draft.md`.
---

# Client clarification draft

## Purpose

Prepare concise questions for the client from `working/missing-information.md` in `working/client-clarification-draft.md`.

## Required inputs

- Project ID and current `working/missing-information.md`.

## Optional inputs

- Current brief and client-input files to avoid repeating already answered questions.

## Allowed actions

1. Read the latest missing-information review and check the related project files for updates.
2. Write concise, specific questions tied to missing or partial information.
3. Ask for clarification of business scope, systems, locations, deadlines, or document context only where the record shows a gap.
4. Create `working/client-clarification-draft.md` and label it as an unsent draft.

## Prohibited actions

- Sending the draft automatically.
- Asking for facts already clearly present in readable project files.
- Making assumptions sound like client commitments.

## Expected outputs

- `working/client-clarification-draft.md`
- A concise run record that identifies the artifact path and any blocker without copying confidential client details.

## Project path conventions

The project root is `D:\AgentOps\agency\projects\<project-id>`. Use only the supplied or already established project ID. Standard directories are `client-input`, `working`, and `outputs`. Resolve paths beneath that project root and never traverse outside it. Do not invent an ID. If the ID or project root is unavailable, stop dependent work and record a blocker.

## Completion criteria

The owned output exists at its specified path, is readable, meets the routine-specific content requirements, separates sourced information from uncertainty, and is recorded in the run log. A partial artifact must be reported as partial.

## Failure and blocker behavior

Do not change source evidence or another routine's files. If required inputs, permissions, or approvals are missing, preserve existing artifacts, state the specific blocker and relevant local path, and complete only independent authorized work. Never fabricate a fallback fact. Do not send or upload communications.

## Routine-specific completion criteria

The draft asks only relevant unresolved questions and remains unsent.
