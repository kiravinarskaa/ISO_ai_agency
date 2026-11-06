---
name: client-input-review
description: Inspect supplied client inputs and record whether expected readiness input categories are available, partial, or missing in `working/missing-information.md`.
---

# Client input review

## Purpose

Inspect supplied client inputs and record whether expected readiness input categories are available, partial, or missing in `working/missing-information.md`.

## Required inputs

- Project ID and readable `client-input` directory.

## Optional inputs

- `working/client-brief.json`; an earlier input review.

## Allowed actions

1. Inspect the project client-input directory and list the files actually present.
2. Assess company profile, organizational information, asset inventory, employee roles, current security practices, existing policies, technical-control evidence, training records, risk records, and corrective-action records.
3. Mark each category available, partial, or missing. Cite file paths and explain partial coverage without claiming content that is not there.
4. Create `working/missing-information.md`; keep observed file availability distinct from any assessment of adequacy.

## Prohibited actions

- Creating or altering technical-control evidence or claiming ISO conformity from file presence alone.
- Treating an unreadable or inaccessible file as available.

## Expected outputs

- `working/missing-information.md`
- A concise run record that identifies the artifact path and any blocker without copying confidential client details.

## Project path conventions

The project root is `D:\AgentOps\agency\projects\<project-id>`. Use only the supplied or already established project ID. Standard directories are `client-input`, `working`, and `outputs`. Resolve paths beneath that project root and never traverse outside it. Do not invent an ID. If the ID or project root is unavailable, stop dependent work and record a blocker.

## Completion criteria

The owned output exists at its specified path, is readable, meets the routine-specific content requirements, separates sourced information from uncertainty, and is recorded in the run log. A partial artifact must be reported as partial.

## Failure and blocker behavior

Do not change source evidence or another routine's files. If required inputs, permissions, or approvals are missing, preserve existing artifacts, state the specific blocker and relevant local path, and complete only independent authorized work. Never fabricate a fallback fact. Do not send or upload communications.

## Routine-specific completion criteria

The inventory covers every expected category and each status has a source or explicit reason.
