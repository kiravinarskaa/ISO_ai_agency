---
name: project-handoff
description: Prepare `working/project-handoff.json` for the Project Manager from the completed brief and available inputs.
---

# Project handoff

## Purpose

Prepare `working/project-handoff.json` for the Project Manager from the completed brief and available inputs.

## Required inputs

- Project ID and `working/client-brief.json`.

## Optional inputs

- Current input review, client-input file inventory, approved specialist outputs, and clarification draft.

## Allowed actions

1. Read the completed brief and available client inputs; use existing review artifacts where current.
2. Create a JSON handoff containing project_id, client_objective, scope_summary, available_evidence, missing_information, assumptions, blockers, and recommended_next_steps.
3. Use evidence paths and concise factual descriptions. Keep unknowns explicit.
4. Write `working/project-handoff.json` for the Project Manager. This local artifact does not assert that the handoff was accepted.

## Prohibited actions

- Making technical determinations owned by specialists.
- Marking missing inputs complete or claiming Project Manager acceptance.

## Expected outputs

- `working/project-handoff.json`
- A concise run record that identifies the artifact path and any blocker without copying confidential client details.

## Project path conventions

The project root is `D:\AgentOps\agency\projects\<project-id>`. Use only the supplied or already established project ID. Standard directories are `client-input`, `working`, and `outputs`. Resolve paths beneath that project root and never traverse outside it. Do not invent an ID. If the ID or project root is unavailable, stop dependent work and record a blocker.

## Completion criteria

The owned output exists at its specified path, is readable, meets the routine-specific content requirements, separates sourced information from uncertainty, and is recorded in the run log. A partial artifact must be reported as partial.

## Failure and blocker behavior

Do not change source evidence or another routine's files. If required inputs, permissions, or approvals are missing, preserve existing artifacts, state the specific blocker and relevant local path, and complete only independent authorized work. Never fabricate a fallback fact. Do not send or upload communications.

## Routine-specific completion criteria

All required handoff keys are present and recommendations follow from recorded evidence or gaps.
