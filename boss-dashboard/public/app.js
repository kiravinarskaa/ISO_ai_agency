// This file only handles the page. The server owns passwords, Google access,
// task validation, and chat answers based on the task ledger.
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
const state = { tasks: [], conversationId: getConversationId("pm"), refreshing: false };
const $ = (selector) => document.querySelector(selector);

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
  $("#count-queued").textContent = state.tasks.filter((task) => task.status === "Queued").length;
  $("#count-progress").textContent = state.tasks.filter((task) => task.status === "In Progress").length;
  $("#count-blocked").textContent = state.tasks.filter((task) => task.status === "Blocked").length;
  $("#count-completed").textContent = state.tasks.filter((task) => completedOn(task, localToday())).length;
  $("#today-label").textContent = new Intl.DateTimeFormat("en", {
    dateStyle: "full", timeZone: "Asia/Tashkent",
  }).format(new Date());
  $("#updated-label").textContent = "Updated " + new Intl.DateTimeFormat("en", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent",
  }).format(new Date());
}

function renderEmployees() {
  const today = localToday();
  $("#employee-cards").innerHTML = EMPLOYEES.map((employee) => {
    const theirTasks = state.tasks.filter((task) => task.employeeId === employee.id);
    const active = theirTasks.find((task) => task.status === "In Progress");
    const next = theirTasks.find((task) => task.status === "Queued");
    const blocked = theirTasks.find((task) => task.status === "Blocked");
    const completed = theirTasks.filter((task) => completedOn(task, today)).length;
    const status = active ? "Active" : blocked ? "Blocked" : "Idle";
    const statusClass = active ? "in-progress" : blocked ? "blocked" : "idle";
    const currentLabel = active
      ? "Working on: " + active.title
      : blocked ? "Blocked on: " + blocked.title
      : next ? "Next in queue: " + next.title : "No open task assigned";
    return '<article class="employee-card">' +
      '<div class="employee-title"><h3>' + employee.name + '</h3>' +
      '<span class="status-pill ' + statusClass + '">' + status + "</span></div>" +
      '<p class="current-task">' + escapeHtml(currentLabel) + "</p>" +
      '<span class="output-count">' + completed + " output(s) completed today</span></article>";
  }).join("");
}

function visibleTasks() {
  const agent = $("#filter-employee").value;
  const status = $("#filter-status").value;
  const priority = $("#filter-priority").value;
  const date = $("#filter-date").value;
  return state.tasks.filter((task) => {
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
    $("#task-list").innerHTML = '<div class="empty-state">No tasks match these filters. Assign a task to begin.</div>';
    return;
  }
  $("#task-list").innerHTML = tasks.map((task) => {
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
      '">' + escapeHtml(task.status) + "</span></div></div>" +
      '<p class="task-description">' + escapeHtml(task.description) + "</p>" +
      '<div class="task-actions"><label>Status<select class="task-status">' + statusOptions +
      '</select></label><label>Blocker reason<input class="task-blocker" value="' +
      escapeAttribute(task.blockerReason) + '" placeholder="Add a reason if blocked"></label>' +
      '<label>Output link<input class="task-result" type="url" value="' +
      escapeAttribute(task.resultLink) + '" placeholder="https://…"></label>' +
      '<button class="button secondary save-task" type="button">Save update</button>' + link +
      "</div></article>";
  }).join("");
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 60000);
}

function renderReports() {
  const today = localToday();
  const week = mondayOfThisWeek();
  const daily = state.tasks.filter((task) => completedOn(task, today));
  const weekly = state.tasks.filter((task) =>
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
    state.tasks.filter((task) => task.status === "Queued" || task.status === "In Progress").length +
    "</strong></div>" +
    '<div class="report-line"><span>Blocked tasks</span><strong>' +
    state.tasks.filter((task) => task.status === "Blocked").length + "</strong></div>" +
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

function renderAll() {
  renderMetrics();
  renderEmployees();
  renderTasks();
  renderReports();
}

async function loadTasks() {
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    const result = await api("/api/tasks");
    state.tasks = result.tasks || [];
    if (result.connected) {
      $("#connection-label").textContent = "Connected to Google Sheet";
      $(".connection-dot").classList.add("connected");
      setSheetAvailable(true);
      showNotice("");
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
      $("#connection-label").textContent = "Sheet unavailable · showing an empty dashboard";
      $(".connection-dot").classList.remove("connected");
      setSheetAvailable(false);
      showNotice(error.message + " The dashboard is still available with no task data.", "warning");
      renderAll();
    }
  } finally {
    state.refreshing = false;
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
        deadline: formData.get("deadline")
          ? new Date(formData.get("deadline")).toISOString()
          : "",
      }),
    });
    state.tasks.unshift(result.task);
    form.reset();
    renderAll();
    message.textContent = "Task added to the Google Sheet as Queued.";
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("error");
  }
});

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
  $("#assign").scrollIntoView({ behavior: "smooth" });
  $("#assign input[name=title]").focus();
});

populateEmployeeSelects();
api("/api/tasks").then(async (result) => {
  state.tasks = result.tasks;
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

// Refresh the shared ledger so employee updates appear without a full reload.
setInterval(async () => {
  if (!$("#dashboard-view").hidden) await loadTasks();
}, 15_000);
