---
name: client-intake
description: Receive a readiness request, read supplied company information, and create `working/client-brief.json`.
---

# Client intake

## Purpose

Receive a readiness request, read supplied company information, and create `working/client-brief.json`.

## Required inputs

- Project ID and incoming client request or company information.

## Optional inputs

- Client supplied files under `client-input`; an existing brief for continuation.

## Allowed actions

1. Read the incoming request and client/company information in the selected project.
2. Create or update `working/client-brief.json` with project_id, client_objective, scope, systems, locations, deadline, known_facts, assumptions, missing_information, and sources.
3. Keep known facts, assumptions, and missing information in separate fields. Each known fact should carry a source path when available.
4. Use only a provided or established project ID. Do not infer facts from industry norms.

## Output schema requirements

The output must be valid JSON.

- `project_id`: string
- `client_objective`: string or null, depending on the validator
- `systems`: array
- `locations`: array
- `known_facts`: array
- `assumptions`: array
- `missing_information`: array

Always represent `systems` and `locations` as JSON arrays.

If the client has not provided systems or locations, use empty arrays:
- `"systems": []`
- `"locations": []`

Record the unknown details in `missing_information`.

Never invent client information to populate these arrays.

For staged Gmail requests, preserve the required `intake_classification` object and its existing fields.

## Prohibited actions

- Inventing client facts, evidence, scope, dates, controls, or certification status.
- Sending a communication or changing supplied source files.

## Expected outputs

- `working/client-brief.json`
- A concise run record that identifies the artifact path and any blocker without copying confidential client details.

## Project path conventions

The project root is `D:\AgentOps\agency\projects\<project-id>`. Use only the supplied or already established project ID. Standard directories are `client-input`, `working`, and `outputs`. Resolve paths beneath that project root and never traverse outside it. Do not invent an ID. If the ID or project root is unavailable, stop dependent work and record a blocker.

## Completion criteria

The owned output exists at its specified path, is readable, meets the routine-specific content requirements, separates sourced information from uncertainty, and is recorded in the run log. A partial artifact must be reported as partial.

## Failure and blocker behavior

Do not change source evidence or another routine's files. If required inputs, permissions, or approvals are missing, preserve existing artifacts, state the specific blocker and relevant local path, and complete only independent authorized work. Never fabricate a fallback fact. Do not send or upload communications.

## Routine-specific completion criteria

The brief is structured, source-aware, and clearly identifies unresolved information.
