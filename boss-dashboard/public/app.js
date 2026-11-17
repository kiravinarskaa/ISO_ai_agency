// This file only handles the page. The server owns passwords, Google access,
// task validation, and chat answers based on the task ledger.
import { scopedTasks, employeeWork, runStatus, filterRuns, selectRunKeys } from "./run-model.js";
const EMPLOYEES = [
  { id: "client-manager", name: "Client Manager" },
  { id: "isms-readiness-planner", name: "ISMS Readiness Planner" },
  { id: "requirements-evidence-specialist", name: "Requirements & Evidence Specialist" },
  { id: "technical-controls-analyst", name: "Technical Controls Analyst" },
  { id: "security-awareness-specialist", name: "Security Awareness Specialist" },
  { id: "corrective-action-specialist", name: "Corrective Action Specialist" },
  { id: "readiness-metrics-analyst", name: "Readiness Metrics Analyst" },
  { id: "project-manager", name: "Project Manager" },
];
const STATUSES = ["Queued", "In Progress", "Blocked", "Completed"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const state = { tasks: [], runs: [], view: "current", runKey: "", archiveAvailable: false,
  runStatus: "all", runSearch: "",
  selectedRuns: new Set(), pendingArchive: null, conversationId: getConversationId("pm"), refreshing: false };
const $ = (selector) => document.querySelector(selector);
const PAGES = {
  overview: ['Overview', 'A clear view of your agency and its latest work.', ['overview']],
  requests: ['Client requests', 'Follow incoming inquiries from receipt to final report.', ['requests']],
  projects: ['Projects & tasks', 'Review assessment runs and the work assigned to your team.', ['projects', 'tasks']],
  team: ['Team', 'Seven specialists and one Project Manager. Current activity, one row each.', ['employees']],
  reports: ['Reports', 'Review completed work and open available report links.', ['reports']],
  history: ['History', 'Previous and archived runs, with their original outcomes preserved.', ['projects', 'tasks']],
  chat: ['Ask the team', 'Ask questions about the recorded task ledger.', ['chat']],
  assign: ['Assign a task', 'Give your team a clear request and expected result.', ['assign']],
};
state.page = 'overview';
function showRoute() {
  const [title, subtitle, sections] = PAGES[state.page] || PAGES.overview;
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  for (const id of ['overview', 'requests', 'projects', 'employees', 'tasks', 'assign', 'reports', 'chat'])
    $('#' + id).hidden = !sections.includes(id);
  for (const page of Object.keys(PAGES).filter(page => page !== 'assign')) {
    $('#nav-' + page).classList.toggle('active', page === state.page);
    $('#nav-' + page).setAttribute('aria-current', page === state.page ? 'page' : 'false');
  }
  $('#scope-panel').hidden = ['chat', 'assign'].includes(state.page);
  $('#run-management').hidden = !['projects', 'history'].includes(state.page);
  $('#projects-heading').textContent = state.page === 'history' ? 'Historical projects' : 'Projects';
}
function navigate(page, updateHash = true) {
  page = ({ employees: 'team', tasks: 'projects' })[page] || page;
  state.page = Object.hasOwn(PAGES, page) ? page : 'overview';
  const view = state.page === 'history' ? 'history' : 'current';
  if (state.view !== view) {
    state.view = view; state.runKey = ''; state.selectedRuns.clear(); state.runStatus = 'all'; state.runSearch = '';
    $('#run-search').value = '';
  }
  if (updateHash && window.location && window.location.hash !== '#' + state.page)
    window.location.hash = state.page;
  renderAll();
}

function updateRunModeForm() {
  const fullRun = $("#run-eight-agents").checked;
  $("#assign-employee").closest("label").hidden = fullRun;
  $("#run-mode-help").hidden = !fullRun;
  $("#task-description-label").querySelector("textarea").placeholder = fullRun
    ? "Enter fictional company and assessment details for this synthetic demo."
    : "Describe the work and what a useful result should include.";
}

function getConversationId(scope) {
  const key = "boss-dashboard-conversation-" + scope;
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
          const random = Math.random() * 16 | 0;
          return (letter === "x" ? random : (random & 3 | 8)).toString(16);
        });
    localStorage.setItem(key, value);
  }
  return value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return result;
}

function setPage(view) {
  $("#login-view").hidden = view !== "login";
  $("#dashboard-view").hidden = view !== "dashboard";
}

function showError(message) {
  showNotice(message, "error");
}

function showNotice(message, kind = "error") {
  const banner = $("#page-error");
  banner.textContent = message;
  banner.classList.remove("error", "warning");
  banner.classList.add(kind);
  banner.hidden = !message;
}

function setSheetAvailable(available) {
  // Viewing is always available; only actions that write to Sheets need this connection.
  $("#task-form button[type=submit]").disabled = !available;
  $("#chat-form button[type=submit]").disabled = !available;
}

function employeeName(id) {
  return EMPLOYEES.find((employee) => employee.id === id)?.name || id || "Unassigned";
}

function taskDateKey(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

function localToday() {
  return taskDateKey(new Date());
}

function mondayOfThisWeek() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent", weekday: "short",
  }).format(now);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const localDate = new Date(now);
  localDate.setDate(localDate.getDate() - ((day + 6) % 7));
  return taskDateKey(localDate);
}

function populateEmployeeSelects() {
  const options = EMPLOYEES.map((employee) =>
    '<option value="' + employee.id + '">' + employee.name + "</option>",
  ).join("");
  $("#assign-employee").innerHTML = options;
  $("#filter-employee").insertAdjacentHTML("beforeend", options);
  $("#chat-employee").insertAdjacentHTML("beforeend", options);
  $("#filter-status").insertAdjacentHTML("beforeend",
    STATUSES.map((status) => '<option value="' + status + '">' + status + "</option>").join(""));
  $("#filter-priority").insertAdjacentHTML("beforeend",
    PRIORITIES.map((priority) => '<option value="' + priority + '">' + priority + "</option>").join(""));
}

function completedOn(task, day) {
  return task.status === "Completed" && task.completionTime &&
    taskDateKey(task.completionTime) === day;
}

function renderMetrics() {
  const tasks = contextTasks();
  $("#count-queued").textContent = tasks.filter((task) => task.status === "Queued").length;
  const inProgress = tasks.filter((task) => task.status === "In Progress");
  const staleProgress = inProgress.filter((task) => task.staleProgress);
  $("#count-progress").textContent = inProgress.length - staleProgress.length;
  $("#progress-note").textContent = staleProgress.length
    ? staleProgress.length + " stale In Progress status(es)" : "Updated within 2 hours";
  $("#count-blocked").textContent = tasks.filter((task) => task.status === "Blocked").length;
  $("#count-completed").textContent = tasks.filter((task) => completedOn(task, localToday())).length;
  $("#today-label").textContent = new Intl.DateTimeFormat("en", {
    dateStyle: "full", timeZone: "Asia/Tashkent",
  }).format(new Date());
  $("#updated-label").textContent = "Updated " + new Intl.DateTimeFormat("en", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent",
  }).format(new Date());
}

function renderEmployees() {
  const today = localToday();
  const tasks = contextTasks();
  $("#employee-cards").innerHTML = EMPLOYEES.map((employee) => {
    const theirTasks = tasks.filter((task) => task.employeeId === employee.id);
    const { active, stale, next, blocked, latestCompleted, olderBlockedCount, olderStaleCount } = employeeWork(tasks, employee.id);
    const completed = theirTasks.filter((task) => completedOn(task, today)).length;
    const status = active ? "Recent update" : stale ? "Stale" : blocked ? "Blocked" : next ? "Queued" : latestCompleted ? "Completed" : "Idle";
    const statusClass = active ? "in-progress" : stale ? "stale" : blocked ? "blocked" : next ? "queued" : latestCompleted ? "completed" : "idle";
    const currentLabel = active
      ? "Recently updated on: " + active.title
      : stale ? "No recent update: " + stale.title + " · " + formatDate(stale.updatedAt || stale.timestamp)
      : blocked ? "Blocked on: " + blocked.title
      : next ? "Next in queue: " + next.title : latestCompleted ? "Latest completed: " + latestCompleted.title : "No open task assigned";
    const initials = employee.name.split(' ').slice(0, 2).map(word => word[0]).join('');
    const earlier = theirTasks.filter(task => task.status === 'Blocked' || (task.status === 'In Progress' && task.staleProgress));
    const history = earlier.length ? '<details class="earlier-work"><summary>' + earlier.length + ' to review</summary><ul>' +
      earlier.slice(0, 5).map(task => '<li>' + escapeHtml(task.title) + ' · ' + escapeHtml(task.status) + '</li>').join('') +
      '</ul><a class="inline-link" href="#projects">Review tasks →</a></details>' : '<span class="muted">—</span>';
    return '<tr><th scope="row"><span class="team-person"><span class="employee-avatar" aria-hidden="true">' + initials + '</span><span>' + employee.name +
      '<small>' + (employee.id === 'project-manager' ? 'Coordination & reporting' : 'Specialist') + '</small></span></span></th>' +
      '<td><span class="status-pill ' + statusClass + '">' + status + '</span></td>' +
      '<td class="team-latest">' + escapeHtml(currentLabel) + '</td><td class="team-total">' + completed +
      '<small>outputs</small></td><td>' + history + '</td></tr>';
  }).join("");
}

function visibleTasks() {
  const agent = $("#filter-employee").value;
  const status = $("#filter-status").value;
  const priority = $("#filter-priority").value;
  const date = $("#filter-date").value;
  return contextTasks().filter((task) => {
    if (agent && task.employeeId !== agent) return false;
    if (status && task.status !== status) return false;
    if (priority && task.priority !== priority) return false;
    if (date === "today" && taskDateKey(task.timestamp) !== localToday()) return false;
    if (date === "week" && taskDateKey(task.timestamp) < mondayOfThisWeek()) return false;
    return true;
  });
}

function statusClass(status) {
  // Keep values read from the Sheet limited to harmless CSS class characters.
  return String(status).toLowerCase().replace(/[^a-z -]/g, "").replaceAll(" ", "-");
}

function safeWebLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function renderTasks() {
  const tasks = visibleTasks();
  if (!tasks.length) {
    $("#task-list").innerHTML = '<div class="empty-state">No tasks in this view match your filters.</div>';
    return;
  }
  $("#task-list").innerHTML = tasks.map((task) => {
    const editable = !task.historical && !task.taskId.startsWith("workflow:");
    const statusOptions = STATUSES.map((status) =>
      '<option ' + (status === task.status ? "selected" : "") + ">" + status + "</option>",
    ).join("");
    const link = task.resultLink && safeWebLink(task.resultLink)
      ? '<a href="' + escapeAttribute(task.resultLink) + '" target="_blank" rel="noopener">Open result</a>'
      : '<span class="muted">' + (task.resultLink ? "Result link is not valid" : "No result link yet") + "</span>";
    return '<article class="task-card" data-task-id="' + escapeAttribute(task.taskId) + '">' +
      '<div class="task-topline"><div><h3>' + escapeHtml(task.title) + "</h3>" +
      '<div class="task-meta"><span>' + escapeHtml(employeeName(task.employeeId)) + "</span>" +
      "<span>Assigned " + escapeHtml(formatDate(task.timestamp)) + "</span>" +
      (task.deadline ? "<span>Due " + escapeHtml(formatDate(task.deadline)) + "</span>" : "") +
      "</div></div><div><span class=\"priority-pill " +
      escapeAttribute(task.priority.toLowerCase().replace(/[^a-z-]/g, "")) + "\">" +
      escapeHtml(task.priority) + "</span> <span class=\"status-pill " + statusClass(task.status) +
      '">' + escapeHtml(task.status) + "</span>" +
      (task.staleProgress ? ' <span class="status-pill stale">No update &gt;2h</span>' : "") +
      "</div></div>" +
      '<p class="task-description">' + escapeHtml(task.description) + "</p>" +
      (editable ? '<div class="task-actions"><label>Status<select class="task-status">' + statusOptions +
      '</select></label><label>Blocker reason<input class="task-blocker" value="' +
      escapeAttribute(task.blockerReason) + '" placeholder="Add a reason if blocked"></label>' +
      '<label>Output link<input class="task-result" type="url" value="' +
      escapeAttribute(task.resultLink) + '" placeholder="https://…"></label>' +
      '<button class="button secondary save-task" type="button">Save update</button>' + link +
      "</div>" : '<div class="task-actions"><span class="muted">Read-only ' + (task.historical ? "history" : "execution ledger") + '</span>' + link + "</div>") + "</article>";
  }).join("");
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 60000);
}

function renderReports() {
  const tasks = contextTasks();
  const today = localToday();
  const week = mondayOfThisWeek();
  const daily = tasks.filter((task) => completedOn(task, today));
  const weekly = tasks.filter((task) =>
    task.status === "Completed" && task.completionTime &&
    taskDateKey(task.completionTime) >= week,
  );
  const durations = weekly.map((task) => minutesBetween(task.timestamp, task.completionTime))
    .filter((value) => value !== null);
  const average = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;
  $("#report-summary").innerHTML =
    '<div class="report-line"><span>Completed today</span><strong>' + daily.length + "</strong></div>" +
    '<div class="report-line"><span>Completed this week</span><strong>' + weekly.length + "</strong></div>" +
    '<div class="report-line"><span>Open tasks</span><strong>' +
    tasks.filter((task) => task.status === "Queued" || task.status === "In Progress").length +
    "</strong></div>" +
    '<div class="report-line"><span>Blocked tasks</span><strong>' +
    tasks.filter((task) => task.status === "Blocked").length + "</strong></div>" +
    '<div class="report-line"><span>Average time from assignment to completion</span><strong>' +
    (average === null ? "Not enough data" : average + " min") + "</strong></div>";

  const counts = EMPLOYEES.map((employee) => ({
    name: employee.name,
    count: weekly.filter((task) => task.employeeId === employee.id).length,
  }));
  const max = Math.max(1, ...counts.map((entry) => entry.count));
  $("#report-employees").innerHTML = counts.map((entry) =>
    '<div class="bar-row"><span>' + entry.name + '</span><div class="bar-track">' +
    '<div class="bar-fill" style="width:' + Math.round(entry.count / max * 100) +
    '%"></div></div><strong>' + entry.count + "</strong></div>",
  ).join("");
}

function renderChat(messages) {
  const history = $("#chat-history");
  history.innerHTML = messages.map((message) => {
    const isBoss = message.speaker === "Boss";
    const speaker = isBoss ? "You" :
      (message.speaker === "project-manager" ? "Project Manager" : employeeName(message.employeeId));
    return '<div class="chat-bubble ' + (isBoss ? "boss" : "") + '">' +
      "<small>" + escapeHtml(speaker) + " · " + escapeHtml(formatDate(message.timestamp)) +
      "</small>" + escapeHtml(message.message) + "</div>";
  }).join("");
  history.scrollTop = history.scrollHeight;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll(String.fromCharCode(96), "&#96;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent",
  }).format(date);
}

function contextTasks() {
  return scopedTasks(state.tasks, state.view, state.runKey);
}

function viewRuns() {
  return state.runs.filter(run => state.view === "history" ? run.historical : !run.historical);
}

function listedRuns() {
  return filterRuns(viewRuns(), { status: state.runStatus, search: state.runSearch, runKey: state.runKey });
}

function renderSelection() {
  const selected = state.runs.filter(run => state.selectedRuns.has(run.key));
  const blocked = selected.filter(run => runStatus(run) === "blocked").length;
  const completed = selected.filter(run => runStatus(run) === "completed").length;
  $("#selected-run-count").textContent = selected.length
    ? selected.length + " run(s) selected · " + blocked + " blocked · " + completed + " fully completed" : "No runs selected";
  $("#clear-run-selection").disabled = selected.length === 0;
  $("#archive-runs").disabled = !state.archiveAvailable || !selected.some(run => run.canArchive);
  $("#restore-runs").disabled = !state.archiveAvailable || !selected.some(run => run.archived);
}

function renderRunControls() {
  const runs = viewRuns();
  if (state.runKey && !runs.some(run => run.key === state.runKey)) state.runKey = "";
  $("#view-current").setAttribute("aria-pressed", state.view === "current");
  $("#view-history").setAttribute("aria-pressed", state.view === "history");
  $("#snapshot-label").textContent = state.view === "history" ? "RUN HISTORY" : "CURRENT WORK";
  $("#tasks-heading").textContent = state.view === "history" ? "Historical tasks" : "Current tasks";
  $("#employee-scope-label").textContent = state.view === "history" ? "Historical statuses for this selection" : "Status comes from current tasks";
  $("#scope-description").textContent = state.view === "history"
    ? "Previous runs and archived work. Records are read-only here. Metrics, employee cards and exports use this selection."
    : "Latest run for each project, plus all queued or running work. Metrics, employee cards and exports use this selection.";
  $("#filter-run").innerHTML = '<option value="">All ' + state.view + ' runs</option>' + runs.map(run =>
    '<option value="' + escapeAttribute(run.key) + '">' + escapeHtml((run.projectId || run.label) + " · " + formatDate(run.updatedAt) + (run.archived ? " · Archived" : "")) + '</option>').join("");
  $("#filter-run").value = state.runKey;
  const listed = listedRuns();
  const eligibleKeys = new Set(listed.filter(run => !run.pending).map(run => run.key));
  state.selectedRuns = new Set([...state.selectedRuns].filter(key => eligibleKeys.has(key)));
  $("#run-count").textContent = "(" + listed.length + " of " + runs.length + " shown)";
  for (const [id, kind] of [["select-blocked", "blocked"], ["select-completed", "completed"], ["select-archived", "archived"], ["select-all-runs", "all"]]) {
    const count = selectRunKeys(listed, kind).length;
    $("#" + id).disabled = !state.archiveAvailable || count === 0;
    $("#" + id).textContent = ({ blocked: "Select blocked runs", completed: "Select completed runs", archived: "Select archived runs", all: "Select all shown" })[kind] + " (" + count + ")";
  }
  $("#filter-run-state").value = state.runStatus;
  $("#run-list").innerHTML = listed.length ? listed.map(run =>
    '<label class="run-row"><input type="checkbox" class="run-select" value="' + escapeAttribute(run.key) + '" ' +
    (state.selectedRuns.has(run.key) ? "checked " : "") + (run.pending || !state.archiveAvailable ? "disabled " : "") + '>' +
    '<span><strong>' + escapeHtml(run.projectId || run.label) + '</strong><small>' + escapeHtml(run.label) + ' · ' +
    escapeHtml(formatDate(run.updatedAt)) + '</small><small>' + run.taskCount + ' tasks · ' + run.completedCount + ' completed · ' + run.blockedCount + ' blocked</small></span>' +
    '<span class="status-pill ' + ({ active: "in-progress", blocked: "blocked", completed: "completed", other: "idle" })[runStatus(run)] + '">' +
    (run.archived ? "Archived · " : "") + ({ active: "Queued / running", blocked: "Blocked", completed: "Completed", other: "Recorded" })[runStatus(run)] + '</span></label>').join("")
    : '<p class="empty-state">No runs in this view.</p>';
  renderSelection();
}

function changeView(view) {
  state.view = view;
  state.runKey = "";
  state.runStatus = "all";
  state.runSearch = "";
  $("#run-search").value = "";
  state.selectedRuns.clear();
  navigate(view === 'history' ? 'history' : state.page === 'history' ? 'projects' : state.page);
}

function previewArchive(action) {
  const runs = state.runs.filter(run => state.selectedRuns.has(run.key) && (action === "archive" ? run.canArchive : run.archived));
  if (!runs.length) return;
  state.pendingArchive = { action, runKeys: runs.map(run => run.key) };
  $("#archive-dialog-title").textContent = action === "archive" ? "Archive selected runs?" : "Unarchive selected runs?";
  $("#archive-preview").textContent = runs.length + " run(s), containing " + runs.reduce((sum, run) => sum + run.taskCount, 0) + " task records. " +
    (action === "archive" ? "They will remain available in History." : "Archive flags will be removed. Older runs of the same project still remain in History.");
  $("#archive-preview-runs").innerHTML = runs.map(run => '<li>' + escapeHtml(run.projectId || run.label) + ' · ' + escapeHtml(formatDate(run.updatedAt)) +
    ' · ' + run.taskCount + ' tasks (' + run.blockedCount + ' blocked, ' + run.completedCount + ' completed)</li>').join("");
  $("#archive-dialog-error").textContent = "";
  $("#archive-confirm").textContent = action === "archive" ? "Archive runs" : "Unarchive runs";
  $("#archive-dialog").showModal();
}

$("#view-current").addEventListener("click", () => changeView("current"));
$("#view-history").addEventListener("click", () => changeView("history"));
$("#filter-run").addEventListener("change", event => { state.runKey = event.target.value; state.selectedRuns.clear(); renderAll(); });
$("#refresh-now").addEventListener("click", loadTasks);
$("#run-list").addEventListener("change", event => {
  if (!event.target.matches(".run-select")) return;
  if (event.target.checked && state.selectedRuns.size >= 100) { event.target.checked = false; $("#archive-message").textContent = "Select at most 100 runs per change."; return; }
  if (event.target.checked) state.selectedRuns.add(event.target.value);
  else state.selectedRuns.delete(event.target.value);
  renderSelection();
});
for (const [id, kind] of [["select-blocked", "blocked"], ["select-completed", "completed"], ["select-archived", "archived"], ["select-all-runs", "all"]]) {
  $("#" + id).addEventListener("click", () => {
    state.selectedRuns = new Set(selectRunKeys(listedRuns(), kind));
    $("#archive-message").textContent = state.selectedRuns.size === 100 ? "Selection limited to 100 runs per change." : "";
    renderRunControls();
  });
}
$("#clear-run-selection").addEventListener("click", () => { state.selectedRuns.clear(); renderRunControls(); });
$("#filter-run-state").addEventListener("change", event => {
  state.runStatus = event.target.value; state.selectedRuns.clear(); renderRunControls();
});
$("#run-search").addEventListener("input", event => {
  state.runSearch = event.target.value; state.selectedRuns.clear(); renderRunControls();
});
$("#clear-run-filters").addEventListener("click", () => {
  state.runStatus = "all"; state.runSearch = ""; $("#run-search").value = "";
  state.selectedRuns.clear(); renderRunControls();
});
$("#archive-runs").addEventListener("click", () => previewArchive("archive"));
$("#restore-runs").addEventListener("click", () => previewArchive("restore"));
$("#archive-cancel").addEventListener("click", () => $("#archive-dialog").close());
$("#archive-dialog").addEventListener("close", () => { state.pendingArchive = null; });
$("#archive-confirm").addEventListener("click", async () => {
  if (!state.pendingArchive) return;
  const change = state.pendingArchive;
  $("#archive-confirm").disabled = true;
  $("#archive-cancel").disabled = true;
  try {
    const result = await api("/api/runs/archive", { method: "POST", body: JSON.stringify(change) });
    $("#archive-dialog").close();
    state.selectedRuns.clear();
    $("#archive-message").textContent = result.changed + " run(s) " + (change.action === "archive" ? "archived. Open History to restore them." : "unarchived.");
    await loadTasks();
  } catch (error) {
    $("#archive-dialog-error").textContent = error.message;
  } finally {
    $("#archive-confirm").disabled = false;
    $("#archive-cancel").disabled = false;
  }
});

function renderAll() {
  showRoute();
  renderRunControls();
  renderMetrics();
  renderEmployees();
  renderTasks();
  renderReports();
  renderProjectLists();
}

function projectRow(run) {
  const status = runStatus(run);
  const label = { active: 'Queued / running', blocked: 'Needs attention', completed: 'Completed', other: 'Recorded' }[status];
  return '<article class="project-row"><div class="project-symbol" aria-hidden="true">▤</div><div class="project-info"><strong>' +
    escapeHtml(run.label || 'Assessment') + '</strong><small>' + escapeHtml(run.projectId || run.key) + '</small><span>' +
    run.completedCount + ' / ' + run.taskCount + ' tasks completed · ' + escapeHtml(formatDate(run.updatedAt)) + '</span></div>' +
    '<span class="status-pill ' + ({ active:'in-progress', blocked:'blocked', completed:'completed', other:'idle' })[status] + '">' + label +
    '</span><button class="button secondary" data-open-run="' + escapeAttribute(run.key) + '">Open<span class="visually-hidden"> ' + escapeHtml(run.projectId || run.label) + '</span> →</button></article>';
}
function renderProjectLists() {
  const runs = viewRuns().filter(run => !state.runKey || run.key === state.runKey);
  const render = list => list.length ? list.map(projectRow).join('') : '<p class="empty-state">No projects in this view.</p>';
  $('#recent-projects').innerHTML = render(runs.slice(0, 5));
  $('#project-list').innerHTML = render(runs);
  const requests = runs.filter(run => state.tasks.some(task => task.runKey === run.key && String(task.executionMode || '').startsWith('email-intake')));
  $('#request-count').textContent = requests.length + ' request(s)';
  $('#request-list').innerHTML = requests.length ? render(requests) : '<p class="empty-state">No email requests recorded in this view.</p>';
  const reports = contextTasks().filter(task => task.employeeId === 'project-manager' && task.status === 'Completed' && safeWebLink(task.resultLink));
  $('#report-library').innerHTML = reports.length ? reports.map(task => '<article class="project-row"><div class="project-info"><strong>' + escapeHtml(task.title) +
    '</strong><small>' + escapeHtml(task.projectId || 'Completed report') + '</small></div><a class="button secondary" target="_blank" rel="noopener" href="' + escapeAttribute(task.resultLink) + '">Open report location ↗</a></article>').join('') :
    '<p class="empty-state">No completed PM report links in this view.</p>';
}

async function loadTasks() {
  if (state.refreshing) return;
  state.refreshing = true;
  $("#refresh-now").disabled = true;
  try {
    const result = await api("/api/tasks");
    state.tasks = result.tasks || [];
    state.runs = result.runs || [];
    state.archiveAvailable = result.archiveAvailable === true;
    if (result.connected) {
      $("#connection-label").textContent = "Connected to Google Sheet";
      $(".connection-dot").classList.add("connected");
      setSheetAvailable(true);
      showNotice(result.warning || "", "warning");
    } else {
      $("#connection-label").textContent = "Sheet not connected · showing an empty dashboard";
      $(".connection-dot").classList.remove("connected");
      setSheetAvailable(false);
      showNotice(result.warning || "Google Sheet is not connected. Showing an empty dashboard.", "warning");
    }
    renderAll();
  } catch (error) {
    if (error.status === 401) setPage("login");
    else {
      // Keep the dashboard available even when the task service is unavailable.
      state.tasks = [];
      state.runs = [];
      state.archiveAvailable = false;
      $("#connection-label").textContent = "Sheet unavailable · showing an empty dashboard";
      $(".connection-dot").classList.remove("connected");
      setSheetAvailable(false);
      showNotice(error.message + " The dashboard is still available with no task data.", "warning");
      renderAll();
    }
  } finally {
    state.refreshing = false;
    $("#refresh-now").disabled = false;
  }
}

async function loadChat() {
  try {
    const result = await api(
      "/api/chat/history?conversationId=" + encodeURIComponent(state.conversationId),
    );
    renderChat(result.messages);
  } catch (error) {
    if (error.status !== 401) {
      // Chat history is optional while the Sheet is disconnected.
      renderChat([]);
    }
  }
}

function downloadCsv() {
  const tasks = visibleTasks();
  const fields = [
    ["Task ID", "taskId"], ["Timestamp", "timestamp"], ["Assigned By", "assignedBy"],
    ["Agent Name", "employeeId"], ["Task Title", "title"],
    ["Task Description", "description"], ["Priority", "priority"], ["Status", "status"],
    ["Output / Result Link", "resultLink"], ["Completion Time", "completionTime"],
    ["Deadline", "deadline"], ["Blocker Reason", "blockerReason"],
    ["Run", "runKey"], ["Archived", "archived"],
  ];
  const csvCell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const lines = [fields.map(([header]) => csvCell(header)).join(",")];
  for (const task of tasks) lines.push(fields.map(([, key]) => csvCell(task[key])).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "agency-task-report.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#login-error");
  message.textContent = "";
  message.classList.remove("error");
  try {
    const password = $("#boss-password").value;
    await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    $("#boss-password").value = "";
    setPage("dashboard");
    await loadTasks();
    await loadChat();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  }
});

$("#logout-button").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: "{}" }); } catch {}
  setPage("login");
});

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $("#task-form-message");
  message.textContent = "Saving task…";
  message.classList.remove("error");
  const formData = new FormData(form);
  try {
    const result = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: formData.get("title"),
        description: formData.get("description"),
        employeeId: formData.get("employeeId"),
        priority: formData.get("priority"),
        executionMode: $("#run-eight-agents").checked
          ? "synthetic-eight-agent"
          : "manual",
        deadline: formData.get("deadline")
          ? new Date(formData.get("deadline")).toISOString()
          : "",
      }),
    });
    await loadTasks();
    form.reset();
    updateRunModeForm();
    renderAll();
    message.textContent = result.task.executionMode === "synthetic-eight-agent"
      ? "Synthetic eight-agent run added to the Sheet as Queued."
      : "Task added to the Google Sheet as Queued.";
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  }
});

$("#run-eight-agents").addEventListener("change", updateRunModeForm);
updateRunModeForm();

$("#task-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".save-task");
  if (!button) return;
  const card = button.closest("[data-task-id]");
  const taskId = card.dataset.taskId;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await api("/api/tasks/" + encodeURIComponent(taskId), {
      method: "PATCH",
      body: JSON.stringify({
        status: card.querySelector(".task-status").value,
        blockerReason: card.querySelector(".task-blocker").value,
        resultLink: card.querySelector(".task-result").value,
      }),
    });
    await loadTasks();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = "Save update";
  }
});

$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chat-message");
  const button = event.currentTarget.querySelector("button");
  const message = input.value.trim();
  if (!message) return;
  button.disabled = true;
  try {
    await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        conversationId: state.conversationId,
        employeeId: $("#chat-employee").value,
        message,
        view: state.view,
        runKey: state.runKey,
      }),
    });
    input.value = "";
    await loadChat();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

for (const selector of ["#filter-employee", "#filter-status", "#filter-priority", "#filter-date"]) {
  $(selector).addEventListener("change", renderTasks);
}
$("#chat-employee").addEventListener("change", async () => {
  // Keep the history for each selected employee separate.
  state.conversationId = getConversationId($("#chat-employee").value || "pm");
  await loadChat();
});
$("#export-csv").addEventListener("click", downloadCsv);
$("#jump-to-assign").addEventListener("click", () => {
  navigate('assign');
  $("#assign input[name=title]").focus();
});

document.addEventListener('click', event => {
  const button = event.target.closest('[data-open-run]');
  if (!button) return;
  const run = state.runs.find(item => item.key === button.dataset.openRun);
  if (!run) return;
  navigate(run.historical ? 'history' : 'projects');
  state.runKey = run.key;
  state.selectedRuns.clear();
  renderAll();
  $('#tasks').scrollIntoView({ behavior: 'smooth' });
});
window.addEventListener('hashchange', () => {
  navigate(window.location.hash.slice(1), false);
  $('#page-title').focus();
  window.scrollTo?.({ top: 0 });
});
navigate(window.location?.hash?.slice(1) || 'overview', false);

populateEmployeeSelects();
api("/api/tasks").then(async (result) => {
  state.tasks = result.tasks;
  state.runs = result.runs || [];
  state.archiveAvailable = result.archiveAvailable === true;
  setSheetAvailable(result.connected === true);
  $("#connection-label").textContent = result.connected ? "Connected to Google Sheet" : "Sheet not connected";
  $(".connection-dot").classList.toggle("connected", result.connected === true);
  showNotice(result.warning || "", "warning");
  setPage("dashboard");
  renderAll();
  await loadChat();
}).catch((error) => {
  if (error.status === 401 || error.status === 503) {
    $("#login-error").textContent = error.status === 503 ? error.message : "";
    setPage("login");
    return;
  }
  // A saved session can still open the dashboard if a data request fails.
  state.tasks = [];
  setPage("dashboard");
  $("#connection-label").textContent = "Sheet unavailable · showing an empty dashboard";
  $(".connection-dot").classList.remove("connected");
  setSheetAvailable(false);
  showNotice(error.message + " The dashboard is still available with no task data.", "warning");
  renderAll();
});

// Refresh immediately when the Boss returns, including browser back/forward
// restoration. loadTasks prevents overlapping requests from these events.
function refreshVisibleDashboard() {
  if (document.visibilityState === "hidden" || $("#dashboard-view").hidden) return;
  return loadTasks();
}

document.addEventListener("visibilitychange", refreshVisibleDashboard);
window.addEventListener("focus", refreshVisibleDashboard);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshVisibleDashboard();
});
window.addEventListener("online", refreshVisibleDashboard);

// Keep the shared ledger current while the dashboard remains open.
setInterval(refreshVisibleDashboard, 15_000);
