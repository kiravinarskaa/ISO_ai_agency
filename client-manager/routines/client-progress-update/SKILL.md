---
name: client-progress-update
description: Prepare `working/client-progress-update-draft.md` from current project status and approved specialist outputs.
---

# Client progress update

## Purpose

Prepare `working/client-progress-update-draft.md` from current project status and approved specialist outputs.

## Required inputs

- Project ID and current project status source.

## Optional inputs

- Approved specialist outputs, handoff, current missing-information review, and prior update draft.

## Allowed actions

1. Read current project status and only specialist outputs that are explicitly approved for client use.
2. Summarize completed work, open issues, blockers, and next actions with owners when recorded.
3. Clearly distinguish completed work from planned work and unresolved issues.
4. Create `working/client-progress-update-draft.md` and label it as an unsent draft.

## Prohibited actions

- Sending any update automatically.
- Presenting unapproved analysis as specialist-approved or inventing dates, progress, or decisions.

## Expected outputs

- `working/client-progress-update-draft.md`
- A concise run record that identifies the artifact path and any blocker without copying confidential client details.

## Project path conventions

The project root is `D:\AgentOps\agency\projects\<project-id>`. Use only the supplied or already established project ID. Standard directories are `client-input`, `working`, and `outputs`. Resolve paths beneath that project root and never traverse outside it. Do not invent an ID. If the ID or project root is unavailable, stop dependent work and record a blocker.

## Completion criteria

The owned output exists at its specified path, is readable, meets the routine-specific content requirements, separates sourced information from uncertainty, and is recorded in the run log. A partial artifact must be reported as partial.

## Failure and blocker behavior

Do not change source evidence or another routine's files. If required inputs, permissions, or approvals are missing, preserve existing artifacts, state the specific blocker and relevant local path, and complete only independent authorized work. Never fabricate a fallback fact. Do not send or upload communications.

## Routine-specific completion criteria

The draft reflects current approved sources and covers completed work, open issues, blockers, and next actions.
