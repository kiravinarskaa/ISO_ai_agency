# Code Guide — Understanding the ISO/IEC 27001 AI Agency

*A beginner-friendly guide to JavaScript, Node.js, AI agents, and multi-agent orchestration.*

## 1. Introduction

This guide explains how the ISO/IEC 27001 Certification Preparation AI Agency works from a programming perspective.

The project consists of eight specialized AI employees, supported by Node.js scripts that coordinate execution, manage files, validate outputs, and communicate with external services.

The most important distinction is:

**The AI model performs reasoning and content generation. JavaScript controls how, when, and under what conditions the AI employees execute.**

You do not need to understand every line of the project immediately. Start with the overall execution flow, then study individual modules and functions.

## 2. Understanding JavaScript File Extensions

Our project primarily uses `.mjs` files.

| Extension | Meaning |
|---|---|
| `.js` | Standard JavaScript file; its module system depends on configuration |
| `.mjs` | JavaScript explicitly interpreted as an ES Module |
| `.cjs` | JavaScript explicitly interpreted as CommonJS |

ES Modules allow us to organize code using `import` and `export`.

For example:

```javascript
import fs from "node:fs";
import path from "node:path";
```

The first statement imports Node.js filesystem functionality.

The second imports utilities for working with paths.

`node:` identifies a built-in Node.js module, so these imports do not require installing additional packages.

Another example:

```javascript
import { ROSTER } from "./run-demo.mjs";
```

This imports a named value called `ROSTER` from another project file.

The `./` means the path is relative to the current file's directory.

### Why use modules?

Without modules, all project functionality could end up in one enormous JavaScript file.

Modules allow us to separate responsibilities:

- Demo execution.
- Employee orchestration.
- Installation verification.
- Gmail processing.
- Reporting.
- Employee-specific runtime management.

This makes the system easier to test, maintain, and understand.

## 3. JavaScript Concepts Used in Our Project

### 3.1 Variables

A variable stores a value.

```javascript
const projectId = "ISO27001-001";
```

Here:

- `const` declares a variable that cannot be reassigned.
- `projectId` is the variable name.
- `"ISO27001-001"` is a string value.

The project ID identifies a particular agency project.

Another example:

```javascript
const results = [];
```

This creates an empty array.

An array can store multiple values, such as the results of processing several employees.

### 3.2 Objects

JavaScript objects group related information.

```javascript
const employee = {
  id: "isms-readiness-planner",
  role: "ISMS Readiness Planner",
  status: "pending"
};
```

An object contains properties.

We can access them using dot notation:

```javascript
console.log(employee.role);
```

This prints:

```text
ISMS Readiness Planner
```

In our agency, objects represent employee configurations, tasks, execution metadata, validation results, and other structured information.

### 3.3 Arrays and Loops

An array stores a collection of values.

```javascript
const employees = [
  "client-manager",
  "isms-readiness-planner",
  "project-manager"
];
```

A loop allows us to process every element:

```javascript
for (const employee of employees) {
  console.log(employee);
}
```

This prints each employee name.

Our demo runner uses the same general concept to process employees from its roster.

### 3.4 Conditions

Conditions allow a program to make decisions.

```javascript
if (result.valid) {
  console.log("Validation passed");
} else {
  console.log("Validation failed");
}
```

If `result.valid` is true, the first block executes.

Otherwise, the second block executes.

In the agency, conditions help determine whether prerequisites are satisfied, artifacts are valid, or a task can proceed.

### 3.5 Functions

Functions group reusable operations.

```javascript
function validateEmployee(employee) {
  return Boolean(employee.id && employee.role);
}
```

This function receives an employee object.

It checks whether the object contains an ID and a role.

It returns `true` or `false`.

Functions help avoid repeating the same logic throughout the program.

### 3.6 Arrow Functions

JavaScript also supports arrow functions.

```javascript
const isCompleted = (task) => task.status === "completed";
```

This function receives a task and checks whether its status equals `"completed"`.

Arrow functions are common in array operations, callbacks, and asynchronous code.

### 3.7 JSON

JSON stands for JavaScript Object Notation.

It is a text format for storing structured data.

For example:

```json
{
  "project_id": "ISO27001-001",
  "employee_id": "client-manager",
  "status": "completed"
}
```

JSON resembles JavaScript objects, but it follows stricter syntax rules.

Our project uses JSON for configurations, receipts, structured employee outputs, manifests, and reporting state.

JavaScript can convert JSON text into an object:

```javascript
const data = JSON.parse(jsonText);
```

It can also convert an object into JSON text:

```javascript
const text = JSON.stringify(data, null, 2);
```

The second and third arguments make the output easier to read by adding indentation.

## 4. Working with Files in Node.js

Our agency relies heavily on local files.

This is because employee outputs must remain available after their AI executions end.

The built-in `fs` module allows Node.js to read and write files.

### Reading a File

```javascript
import fs from "node:fs";

const content = fs.readFileSync("example.json", "utf8");
```

Here:

- `readFileSync` reads a file synchronously.
- `"example.json"` identifies the file.
- `"utf8"` specifies text encoding.
- `content` stores the file's text.

A synchronous operation blocks the current JavaScript thread until it finishes.

### Writing a File

```javascript
fs.writeFileSync("report.txt", "Example report");
```

This creates or overwrites a file.

Writing files is important because employee outputs must be preserved for later workflow stages.

### Working with Paths

```javascript
import path from "node:path";

const filePath = path.join(
  "agency",
  "demo",
  "run-demo.mjs"
);
```

`path.join()` combines path components using the appropriate separator for the operating system.

`path.resolve()` converts a path into an absolute path.

Path validation matters because an incorrect or malicious path could direct a program outside the intended workspace.

## 5. Asynchronous JavaScript

Some operations take time to complete.

Examples include:

- Starting another process.
- Calling an API.
- Reading asynchronous filesystem data.
- Waiting for an external operation.

JavaScript supports asynchronous operations using promises.

### 5.1 Promises

A Promise represents the eventual result of an operation.

It can be:

- Pending.
- Fulfilled.
- Rejected.

Example:

```javascript
function getResult() {
  return Promise.resolve("completed");
}
```

This returns a fulfilled Promise.

### 5.2 Async and Await

The `async` keyword declares an asynchronous function.

The `await` keyword waits for a Promise to settle before continuing within that function.

```javascript
async function runTask() {
  const result = await getResult();
  console.log(result);
}
```

The code prints:

```text
completed
```

`await` makes asynchronous code easier to read without blocking the entire Node.js event loop in the same way as a synchronous operation.

### 5.3 Error Handling

Operations can fail.

JavaScript uses `try`, `catch`, and sometimes `finally` to handle errors.

```javascript
try {
  const content = fs.readFileSync("report.json", "utf8");
  console.log(content);
} catch (error) {
  console.error("Unable to read file:", error.message);
}
```

Instead of allowing an unexpected error to pass unnoticed, the program reports the problem.

Error handling is especially important for AI-agent systems because tasks may fail due to invalid input, unavailable tools, execution errors, or missing outputs.

## 6. What Makes an AI Agent Different from an Ordinary Script?

A traditional automation script follows predefined instructions.

For example:

```javascript
if (task.status === "pending") {
  console.log("Task is ready");
}
```

This is deterministic logic. It checks a condition and produces a predictable result for the given state.

An AI employee uses an LLM to interpret a task and produce a result.

For example, the Requirements & Evidence Specialist may receive an organization's security documentation and be asked to identify missing evidence relevant to ISO/IEC 27001 preparation.

The model must interpret the provided information and generate recommendations.

Unlike a fixed JavaScript rule, an LLM can produce different responses to similar inputs.

### Our hybrid architecture

Our system combines both approaches:

**Deterministic JavaScript:**
- Controls execution eligibility.
- Starts employee processes.
- Maintains task state.
- Checks output files.
- Records execution results.
- Manages reporting approvals.

**LLM-powered employees:**
- Interpret client information.
- Analyze security-related documentation.
- Identify potential gaps.
- Prepare recommendations.
- Generate structured reports.

This separation is one of the central design decisions in the project.

## 7. Understanding Codex CLI

Codex CLI provides the execution environment used for our AI employees.

Instead of implementing and training a new language model, the project uses an existing AI coding-agent environment.

Our Node.js infrastructure prepares tasks and launches Codex processes.

A subprocess is a separate program started by another program.

For example, Node.js provides:

```javascript
import { spawn } from "node:child_process";
```

The `spawn` function can launch an external executable.

The project uses subprocess execution to invoke AI employee routines.

The calling Node.js process can observe process completion and apply additional checks to the generated output.

Importantly, a successful process exit does not necessarily mean that the employee produced an accurate or complete security assessment.

## 8. Understanding the Eight AI Employees

Each employee specializes in one part of the certification-preparation process.

| Employee | Main task |
|---|---|
| Client Manager | Organizes client intake information |
| ISMS Readiness Planner | Produces a readiness roadmap |
| Requirements & Evidence Specialist | Prepares an evidence register |
| Technical Controls Analyst | Reviews technical control information |
| Security Awareness Specialist | Develops awareness training recommendations |
| Corrective Action Specialist | Organizes corrective actions |
| Readiness Metrics Analyst | Summarizes readiness indicators |
| Project Manager | Consolidates the final report |

The employees do not all share one continuously running LLM conversation.

Instead, they execute assigned tasks and exchange information through files.

This is called artifact-based coordination.

## 9. Understanding `run-demo.mjs`

File:

`agency/demo/run-demo.mjs`

This is the main entry point for the fixed eight-employee demonstration and the guarded specialist execution used by the continuous public intake launcher. The routine is not a continuously polling service.

Its responsibilities include:

1. Identifying the target project.
2. Loading the defined employee roster.
3. Checking employee prerequisites.
4. Preparing the execution sequence.
5. Running or reusing eligible employee work.
6. Validating the expected outputs.
7. Producing a run manifest.

### Example command

```powershell
node agency/demo/run-demo.mjs --project ISO27001-001
```

The command tells Node.js to execute the demonstration script.

`--project` supplies the project identifier.

### Important: artifact reuse

The demo runner supports dependency-based reuse.

If a previously generated artifact remains valid for unchanged inputs, the system may reuse it rather than asking the AI employee to regenerate it.

This means a completed demo does not necessarily represent eight new LLM executions.

### Continuous launcher: `start-agency.mjs`

For the actual public email workflow, the main process is `agency/start-agency.mjs`:

```powershell
cd D:\AgentOps
node .\agency\start-agency.mjs
```

It does more than call the runner: it repeatedly checks Gmail, dispatches eligible Client Manager intake tasks, reconciles completed intake records, checks classification and data sufficiency, and initiates guarded downstream work for eligible projects. It can resume previously staged work without resending email.

Conceptually, the launcher behaves like this simplified pseudocode (not the exact source):

```javascript
async function scan() {
  await dispatchEligibleClientIntake();
  const decisions = await reconcileCompletedIntakes();
  for (const decision of decisions) {
    if (decision.securityHold) continue; // Never bypass review.
    if (!decision.preliminaryEligible) continue;
    await startGuardedSpecialists(decision.projectId);
  }
}
```

The real implementation additionally persists workflow state, observes budgets and locks, checks validated outputs, and reports safe reasons for blocked work. A prior live failure (`reconcileCompletedIntakes is not defined`) illustrated why correct `import`/`export` and startup-path tests matter.

### Public intake policy and reconciliation

`agency/integrations/gmail/public-intake-policy.mjs` evaluates whether a public project is eligible for preliminary specialist processing. The intake poller and orchestrator reconcile structured data into `working/public-intake-record.json` from an accepted staged source. A validated intake record is **not** the same as verified sender identity or verified ISMS evidence.

The policy checks both data sufficiency and current classification. A project categorized as `suspicious_or_requires_review` requires an authorized, auditable review outcome before specialist execution; without it, the block reason is `PUBLIC_SECURITY_REVIEW_REQUIRED`.

Source references must be safe project-relative paths. Allowing arbitrary absolute paths would make email-derived text a dangerous source of file access authority. The reconciliation fix only normalizes a reference when it resolves to the expected staged source `client-input/gmail-intake.json`.

### Monitoring, background tasks and recovery

Gmail polling can continue while the guarded specialist runner is operating. Progress lines such as `Employee STARTED`, `Employee COMPLETED`, `Employee REUSED`, and `3/8 validated` describe actual status; a running employee does not count as validated. Project-scoped locks, workflow state and manifest validation help prevent duplicate work when a launcher restarts.

A terminal message like `0 new inquiry tasks` only says that the inbox poll did not stage new messages—it does **not** mean that previously started specialists stopped. Similarly, `preliminary_report_ready` represents **local** validation, not approved spreadsheet publication or an email being sent.

## 10. Understanding `orchestrator.mjs`

File:

`agency/orchestrator/orchestrator.mjs`

The orchestrator manages general execution coordination.

Its responsibilities include task handling, execution state, validation, process invocation, and recovery logic.

An orchestrator is comparable to a coordinator in a human team.

It does not need to perform every task itself.

Instead, it ensures that the appropriate employee receives work under acceptable conditions.

### Orchestration versus reasoning

The orchestrator determines whether a task can be executed according to programmed rules.

The AI employee interprets the actual task content and generates the requested deliverable.

This division helps keep operational control separate from model-generated decisions.

## 11. Understanding Employee Runtime Scripts

Each employee directory contains several JavaScript helper files.

These scripts are mostly deterministic infrastructure.

### 11.1 `guard.mjs`

A guard checks whether an employee is allowed to run.

Depending on configuration, it may evaluate:

- Pause settings.
- Execution schedules.
- Allowed time windows.
- Whether a task period was already processed.
- Whether a lease is active.

A guard helps prevent unintended execution.

### 11.2 `run-state.mjs`

This file manages employee execution state.

It supports tracking and coordination of runtime activity.

It also contains mechanisms intended to prevent conflicting overlapping executions.

### 11.3 `runlog.mjs`

This file handles execution log records.

Logging helps establish what happened during an operation.

The implementation includes validation intended to prevent unsuitable or sensitive information from being written into certain log records.

### 11.4 `work-cycle.mjs`

This module contains workflow-related utility functions.

Its functionality includes checks and operations inherited from the original AI-employees kit.

Some of those capabilities relate to marketing workflows and are not necessarily active in the ISO/IEC 27001 routine.

### 11.5 `copy-check.mjs`

This is a legacy marketing copy-checking utility.

It is not the component responsible for assessing ISO/IEC 27001 compliance.

Its presence demonstrates that an adapted software system may contain inherited functionality outside its current primary purpose.

## 12. Understanding Receipts and Hashes

Our project contains:

- `agency/demo/receipts.mjs`
- `agency/demo/migrate-receipts.mjs`

These modules are related to installation verification.

### What is a receipt?

An installation receipt is a record describing an installed employee configuration.

In our project, installation receipts use the filename:

`.installed.json`

### What is a hash?

A hash is a fixed-length fingerprint calculated from data.

A cryptographic hash function such as SHA-256 produces a value that changes when the underlying content changes, except for extremely unlikely collisions.

Hashes help detect differences between expected and actual files.

They do not encrypt the files.

### Why migrate receipts?

Our agency adapted employees from an existing AI-employees kit.

Changing employee identities and routines can make old installation records inconsistent with new configurations.

The migration utility verifies original evidence, preserves historical records, updates the receipts, and verifies the results.

This maintains installation history instead of inventing new installation evidence.

**Do not execute the receipt migration utility merely to study it.** It modifies installation records.

## 13. Understanding Gmail Intake

The Gmail integration includes:

- `agency/integrations/gmail/gmail.mjs`
- `agency/integrations/gmail/intake-poller.mjs`
- `agency/integrations/gmail/public-intake-policy.mjs`

### Gmail connector

The connector handles authorized Gmail access using OAuth.

Its intake permissions are read-only.

### Intake poller

The poller processes eligible incoming messages.

It performs deterministic operations such as polling, filtering, and deduplication.

Downstream Client Manager work can then use AI-assisted interpretation. The continuous launcher reconciles completed classifications, then may trigger the seven specialists for an eligible, bounded **public preliminary** project. Held messages do not become eligible solely because their contents look complete.

### Why is email untrusted?

A message can contain false information, malicious links, or instructions intended to manipulate an AI model.

These instructions must not be treated as higher-priority system commands.

This is particularly important when an AI employee processes externally supplied text.

## 14. Understanding the Reporting Bridge

File:

`agency/integrations/reporting/reporting.mjs`

The reporting bridge handles Google Sheets and Gmail integration.

Unlike the specialized employees, it does not require an LLM to decide how to perform its normal reporting operations.

Its responsibilities include:

1. Processing validated execution information.
2. Preparing spreadsheet records.
3. Obtaining operator approval for publication.
4. Publishing records to Google Sheets.
5. Preparing a confirmation email.
6. Obtaining separate operator approval for sending.
7. Recording reporting state and results.

### Why separate preparation and approval?

Preparing data and publishing it externally are different levels of responsibility.

An AI-generated artifact should not automatically authorize a Google API operation.

The approval boundary provides human oversight through manual approval or a valid operator-created standing policy. Public `preliminary_report_ready` is not publication authority by itself. A workflow policy can authorize automatic public progress/final publication and internal completion delivery; customer messages additionally require their contact policy and authenticated original thread. Synthetic-demo authorization is not transferable to arbitrary public projects.

## 15. Understanding State, Memory, and Context

These terms are frequently confused.

### Context

Context is the information made available to an LLM during a task.

It may include instructions, project files, and previous employee outputs.

### Memory

Memory refers to information retained across interactions or executions.

Our project primarily exchanges persistent information through files rather than assuming that every employee has access to one shared conversational memory.

### State

State describes the current operational condition of a process or task.

For example:

```json
{
  "task": "prepare-readiness-roadmap",
  "status": "completed"
}
```

This is a simplified example rather than an actual project state record.

### Artifact

An artifact is a file produced by a task.

Examples include:

- `client-brief.json`
- `evidence-register.md`
- `final-agency-report.md`

Artifacts allow work from one execution to be reused or inspected later.

## 16. Worked Example: One Client Project

Assume a fictional small organization wants to prepare for an ISO/IEC 27001 certification audit.

The organization has a security policy and some technical controls but lacks organized evidence and a structured preparation plan.

The following example demonstrates the intended workflow. The hypothetical findings are illustrative, not actual outputs from a verified client assessment.

### Step 1 — Client Manager

Receives the synthetic client's information.

Produces:

`client-brief.json`

This document structures the initial requirements and available information.

### Step 2 — ISMS Readiness Planner

Uses the available project context to outline preparation activities.

Produces:

`isms-readiness-plan.md`

The roadmap identifies stages and priorities for readiness work.

### Step 3 — Requirements & Evidence Specialist

Examines the project information and prepares a list of evidence needs.

Produces:

`evidence-register.md`

For example, it might identify that the client needs clearer evidence of access reviews.

### Step 4 — Technical Controls Analyst

Reviews the technical security information available in the project.

Produces:

`technical-controls-assessment.md`

It might recommend documenting MFA coverage or vulnerability management processes.

### Step 5 — Security Awareness Specialist

Develops a training approach based on relevant security awareness needs.

Produces:

`awareness-training-plan.md`

### Step 6 — Corrective Action Specialist

Organizes identified readiness gaps into recommended actions.

Produces:

`corrective-action-register.md`

### Step 7 — Readiness Metrics Analyst

Summarizes the available readiness indicators.

Produces:

`readiness-dashboard.md`

### Step 8 — Project Manager

Consolidates the project deliverables.

Produces:

`final-agency-report.md`

The resulting report helps organize preparation activities but does not prove that the organization meets ISO/IEC 27001 certification requirements.

## 17. Understanding Tests

A test checks whether software behaves as expected under specified conditions.

For example:

```javascript
import assert from "node:assert/strict";

const result = 2 + 2;

assert.equal(result, 4);
```

If the result is not equal to 4, the assertion fails.

Our project contains tests for:

- Demo execution.
- Installation and artifact validation.
- Gmail connector behavior.
- Intake polling.
- Orchestrator operations.
- Reporting approvals and failure handling.

Tests can use mocks or temporary fixtures to avoid performing real external operations.

### What tests cannot guarantee

Passing tests does not automatically mean that:

- Every employee recommendation is correct.
- The system is secure against all attacks.
- Every integration will work under real-world conditions.
- The organization is ISO/IEC 27001 compliant.

Tests provide evidence for specific behaviors, not universal correctness.

## 18. Recommended Source-Code Reading Order

For learning, read the project in this order:

| Order | File | What to focus on |
|---|---|---|
| 1 | `agency/start-agency.mjs` | Continuous polling, queue scan, readiness decision and automatic handoff |
| 2 | `agency/integrations/gmail/public-intake-policy.mjs` | Classification and preliminary data eligibility |
| 3 | `agency/integrations/gmail/intake-poller.mjs` | Incoming email staging and record reconciliation |
| 4 | `agency/demo/run-demo.mjs` | How eight guarded employee tasks are coordinated |
| 5 | `agency/orchestrator/orchestrator.mjs` | How tasks are executed and validated |
| 6 | `isms-readiness-planner/scripts/guard.mjs` | How execution permission is checked |
| 7 | `isms-readiness-planner/scripts/run-state.mjs` | State, ownership, and concurrency |
| 8 | `isms-readiness-planner/scripts/runlog.mjs` | Execution records |
| 9 | `agency/demo/receipts.mjs` | Installation validation and hashes |
| 10 | `agency/demo/migrate-receipts.mjs` | Installation migration and provenance |
| 11 | `agency/integrations/gmail/gmail.mjs` | OAuth and Gmail access |
| 12 | `agency/integrations/reporting/reporting.mjs` | External reporting and approvals |

Do not attempt to memorize the full source code.

For each function, identify:

1. What inputs does it receive?
2. What result does it produce?
3. Does it read or write files?
4. Can it start another process?
5. What checks does it perform?
6. What happens when something fails?
7. Is this deterministic JavaScript, or does it invoke an AI model?

These questions will help you understand both the programming and the architecture.

## 19. Glossary

| Term | Explanation |
|---|---|
| AI agent | A system that uses an AI model to pursue assigned objectives, potentially using tools |
| LLM | Large Language Model; a model trained to process and generate language |
| Codex CLI | The command-line AI coding-agent environment used to execute employee tasks |
| Orchestrator | Software that coordinates tasks and their execution |
| Subprocess | A program started by another running program |
| Prompt | Instructions and context supplied to an AI model |
| Context | Information available during a particular model execution |
| Artifact | A file produced by a task |
| Manifest | A structured record describing an execution and its results |
| Receipt | A record used to verify installation information |
| SHA-256 | A cryptographic hash algorithm |
| Guard | A rule that controls whether execution is allowed |
| Lease | A temporary claim of ownership over a task or resource |
| Atomic operation | An operation intended to occur as one indivisible action |
| Idempotency | A property that allows repetition without accumulating unintended changes |
| OAuth 2.0 | An authorization framework used to grant applications limited access |
| API | Application Programming Interface; a way for software systems to interact |
| JSON | A structured text format used for data exchange |
| Markdown | A lightweight text format used for documentation |
| Prompt injection | An attempt to manipulate an AI system through untrusted content |
| Validation | Checking data or outputs against defined requirements |
| Deterministic code | Code whose behavior follows predefined rules for the same relevant inputs and state |

## 20. Final Perspective

The most important lesson from this project is that a multi-agent system is not simply a collection of LLM prompts.

A functioning implementation needs infrastructure for:

- Preparing and assigning tasks.
- Supplying context.
- Starting AI executions.
- Validating outputs.
- Managing failures.
- Preserving artifacts.
- Controlling permissions.
- Recording results.
- Integrating with external systems.

Our ISO/IEC 27001 AI Agency coordinates a local eight-employee workflow. A recovered run reached eight validated outputs and generated a Word report on 6 November 2026. Sheets publication, internal completion-email receipt and a customer acknowledgment were demonstrated. These are separate observations; complete customer clarification and final customer notice have not both been confirmed. Individual test counts belong to their code revisions, not a single aggregate current result.

**The AI employees generate and interpret information. The surrounding software makes their work coordinated, traceable, and subject to operational controls.**

---

*This guide describes the educational implementation and uses simplified examples where indicated. The actual JavaScript source and its tests remain the authoritative reference for executable behavior.*

## Current implementation additions as of 6 November 2026

- `agency/demo/management-report-contract.mjs`: validates the PM management-report sections and finding fields.
- `agency/demo/final-report-docx.mjs`: local Node.js OOXML export of the PM synthesis with source references. Structural checks do not replace visual review.
- `agency/demo/recover-evidence-revision.mjs`: explicit operator recovery for supported stale completed reports after source changes, preserving archived leases and spent budgets.
- `agency/start-agency.mjs`: detects newer completed local recovery manifests after exhausted agent-validation retries and resumes authorized reporting. It also filters terminal noise and displays console time in Asia/Tashkent.
- `agency/integrations/reporting/reporting.mjs`: fixed customer acknowledgment, clarification and completion notices with sender/thread checks and separate dedupe ledgers. Customer sending can explicitly reuse the existing send grant under policy.
- Public daily intake/execution quotas are disabled. Deduplication, sequential execution, task retry limits and employee guards remain.

The earlier approval steps describe the manual reporting path. Standing workflow policies support unattended reporting without asking for approval on every message. Internal completion bodies currently carry a fictional-test label and omit links/report text. Customer bodies omit internal project references, links and attachments.

Read [README](README.md), [architecture](ARCHITECTURE.md), [reporting](agency/integrations/reporting/README.md) and [customer responses](agency/CUSTOMER-RESPONSES.md) for current operating instructions. Neither Sheets execution rows nor a local Word export establish that the full hosted Boss Command Center required by the assignment is complete.
