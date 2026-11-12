import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep these IDs aligned with the eight roles in the agency runner.
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

// The existing Ledger tab remains the execution history. These new tabs hold
// assigned work and the saved Project Manager chat without changing old columns.
const TASK_TAB = "Task Ledger";
const CHAT_TAB = "Chat History";
const TASK_HEADERS = [
  "Task ID", "Timestamp", "Assigned By", "Agent Name", "Task Description",
  "Priority", "Status", "Output / Result Link", "Completion Time", "Title",
  "Deadline", "Blocker Reason", "Updated At", "Execution Mode",
  "Parent Task ID", "Project ID",
];
const CHAT_HEADERS = [
  "Conversation ID", "Timestamp", "Speaker", "Employee ID", "Message",
];
const STATUSES = ["Queued", "In Progress", "Blocked", "Completed"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");
const COOKIE_NAME = "boss_session";
const SESSION_HOURS = 12;
const MAX_BODY_BYTES = 32_000;

function requiredSetting(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing Railway variable: " + name);
  return value;
}

async function getSheetsClient() {
  // Parse the service account from Railway's secret variables. Never save it
  // to disk or send it to the browser.
  const accountText = requiredSetting("GOOGLE_SERVICE_ACCOUNT_JSON");
  let credentials;
  try {
    credentials = JSON.parse(accountText);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must contain valid JSON");
  }
  // Load the API library only for Sheet requests; static pages stay lightweight.
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function spreadsheetId() {
  return requiredSetting("GOOGLE_SPREADSHEET_ID");
}

async function ensureTab(sheets, title, headers) {
  const bookId = spreadsheetId();
  const book = await sheets.spreadsheets.get({
    spreadsheetId: bookId,
    fields: "sheets.properties.title",
  });
  const found = (book.data.sheets || []).some(
    (sheet) => sheet.properties?.title === title,
  );

  // Create the task/chat tabs if they have not been added yet.
  if (!found) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: bookId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }

  const headerRange = quoteTab(title) + "!A1:" + columnName(headers.length) + "1";
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: bookId,
    range: headerRange,
  });
  const row = current.data.values?.[0] || [];
  if (row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: bookId,
      range: headerRange,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  } else if (row.some((value, index) => value !== headers[index])) {
    throw new Error(
      "The " + title + " tab already has different headers. Review it before connecting.",
    );
  } else if (row.length < headers.length) {
    // Add new columns on the right while preserving every existing task row.
    await sheets.spreadsheets.values.update({
      spreadsheetId: bookId,
      range: quoteTab(title) + "!" + columnName(row.length + 1) + "1:" +
        columnName(headers.length) + "1",
      valueInputOption: "RAW",
      requestBody: { values: [headers.slice(row.length)] },
    });
  }
}

function quoteTab(name) {
  return "'" + name.replaceAll("'", "''") + "'";
}

function columnName(number) {
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

async function readRows(tab, headers) {
  const sheets = await getSheetsClient();
  await ensureTab(sheets, tab, headers);
  const range = quoteTab(tab) + "!A2:" + columnName(headers.length);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
  });
  return (result.data.values || []).map((cells, index) => ({
    rowNumber: index + 2,
    cells: headers.map((_, column) => cells[column] || ""),
  }));
}

function taskFromRow(row) {
  const cells = row.cells;
  return {
    rowNumber: row.rowNumber,
    taskId: cells[0],
    timestamp: cells[1],
    assignedBy: cells[2],
    employeeId: cells[3],
    description: cells[4],
    priority: cells[5],
    status: cells[6],
    resultLink: cells[7],
    completionTime: cells[8],
    title: cells[9],
    deadline: cells[10],
    blockerReason: cells[11],
    updatedAt: cells[12],
    executionMode: cells[13] || "manual",
    parentTaskId: cells[14],
    projectId: cells[15],
  };
}

function isWebLink(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function getTasks() {
  const rows = await readRows(TASK_TAB, TASK_HEADERS);
  return rows.map(taskFromRow)
    .filter((task) => task.taskId)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

async function writeTask(task, rowNumber) {
  const sheets = await getSheetsClient();
  await ensureTab(sheets, TASK_TAB, TASK_HEADERS);
  const values = [[
    task.taskId, task.timestamp, task.assignedBy, task.employeeId,
    task.description, task.priority, task.status, task.resultLink,
    task.completionTime, task.title, task.deadline, task.blockerReason,
    task.updatedAt, task.executionMode || "manual", task.parentTaskId || "",
    task.projectId || "",
  ]];

  if (rowNumber) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: quoteTab(TASK_TAB) + "!A" + rowNumber + ":P" + rowNumber,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: quoteTab(TASK_TAB) + "!A:P",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
  }
}

async function saveChat(conversationId, speaker, employeeId, message) {
  const sheets = await getSheetsClient();
  await ensureTab(sheets, CHAT_TAB, CHAT_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: quoteTab(CHAT_TAB) + "!A:E",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[
      conversationId, new Date().toISOString(), speaker, employeeId, message,
    ]] },
  });
}

async function getChatHistory(conversationId) {
  const rows = await readRows(CHAT_TAB, CHAT_HEADERS);
  return rows
    .filter((row) => row.cells[0] === conversationId)
    .map((row) => ({
      timestamp: row.cells[1],
      speaker: row.cells[2],
      employeeId: row.cells[3],
      message: row.cells[4],
    }));
}

function sessionSecret() {
  const secret = requiredSetting("SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

function createSession() {
  const expiry = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ expiry })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return payload + "." + signature;
}

function hasValidSession(request) {
  const cookies = (request.headers.cookie || "").split(";").map((part) => part.trim());
  const cookie = cookies.find((part) => part.startsWith(COOKIE_NAME + "="));
  if (!cookie) return false;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return false;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).expiry > Date.now();
  } catch {
    return false;
  }
}

function passwordMatches(candidate) {
  const expected = Buffer.from(requiredSetting("BOSS_PASSWORD"));
  const supplied = Buffer.from(candidate || "");
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function checkSameOrigin(request) {
  // Browser writes must originate from this dashboard, not another website.
  const origin = request.headers.origin;
  if (!origin || new URL(origin).host !== request.headers.host) {
    throw new Error("Request origin is not allowed");
  }
}

function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfWeek(date = new Date()) {
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    weekday: "short",
  }).format(date);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(localParts);
  const localDate = new Date(date);
  localDate.setDate(localDate.getDate() - ((weekday + 6) % 7));
  return todayKey(localDate);
}

function answerFromTasks(question, selectedEmployee, tasks) {
  const text = question.toLowerCase();
  const relevant = selectedEmployee
    ? tasks.filter((task) => task.employeeId === selectedEmployee)
    : tasks;
  const label = selectedEmployee
    ? EMPLOYEES.find((employee) => employee.id === selectedEmployee)?.name || selectedEmployee
    : "the agency";

  if (text.includes("block")) {
    const blocked = relevant.filter((task) => task.status === "Blocked");
    if (!blocked.length) return "There are no blocked tasks recorded for " + label + ".";
    return blocked.map((task) =>
      task.title + ": " + (task.blockerReason || "No blocker reason has been recorded."),
    ).join("\n");
  }

  if (text.includes("most") && text.includes("week")) {
    const weekStart = startOfWeek();
    const counts = EMPLOYEES.map((employee) => ({
      employee,
      count: relevant.filter((task) =>
        task.employeeId === employee.id &&
        task.status === "Completed" &&
        task.completionTime &&
        task.completionTime.slice(0, 10) >= weekStart,
      ).length,
    })).sort((a, b) => b.count - a.count);
    if (!counts.length || counts[0].count === 0) {
      return "No completed tasks are recorded for this week yet.";
    }
    return counts[0].employee.name + " has completed the most this week: " +
      counts[0].count + " task(s), based on the ledger.";
  }

  if (text.includes("running") || text.includes("in progress") || text.includes("currently")) {
    const running = relevant.filter((task) => task.status === "In Progress");
    return label + " has " + running.length + " task(s) marked In Progress.";
  }

  if (text.includes("today")) {
    const asksForCompletion = ["completed", "finished", "done", "published", "output"]
      .some((word) => text.includes(word));
    const count = relevant.filter((task) => {
      if (asksForCompletion) {
        return task.status === "Completed" &&
          task.completionTime &&
          todayKey(new Date(task.completionTime)) === todayKey();
      }
      return task.timestamp && todayKey(new Date(task.timestamp)) === todayKey();
    }).length;
    return label + (asksForCompletion
      ? " has completed " + count + " task(s) today."
      : " has received " + count + " task(s) today.");
  }

  if (text.includes("status") || text.includes("how many") || text.includes("summary")) {
    const counts = Object.fromEntries(STATUSES.map((status) => [
      status, relevant.filter((task) => task.status === status).length,
    ]));
    return label + " task counts: " +
      STATUSES.map((status) => status + " " + counts[status]).join(", ") + ".";
  }

  return "I can answer from the task ledger about task counts, running work, blocked reasons, and this week's completions. I don't have enough ledger data to answer that question yet.";
}

async function serveFile(response, filename, contentType) {
  try {
    const content = await fs.readFile(path.join(PUBLIC, filename));
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; " +
        "img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "Referrer-Policy": "same-origin",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    json(response, 200, { ok: true, service: "boss-dashboard" });
    return;
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    checkSameOrigin(request);
    const body = await readJson(request);
    if (!passwordMatches(body.password)) {
      json(response, 401, { error: "Password not accepted" });
      return;
    }
    const secure = process.env.NODE_ENV === "production" ||
      request.headers["x-forwarded-proto"] === "https"
      ? "; Secure"
      : "";
    response.writeHead(200, {
      "Set-Cookie": COOKIE_NAME + "=" + createSession() +
        "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" +
        SESSION_HOURS * 60 * 60 + secure,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    checkSameOrigin(request);
    response.writeHead(200, {
      "Set-Cookie": COOKIE_NAME + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!hasValidSession(request)) {
    json(response, 401, { error: "Sign in to continue" });
    return;
  }

  if (request.method !== "GET") checkSameOrigin(request);

  if (url.pathname === "/api/employees" && request.method === "GET") {
    json(response, 200, { employees: EMPLOYEES });
    return;
  }

  if (url.pathname === "/api/tasks" && request.method === "GET") {
    const missing = missingSheetSettings();
    if (missing.length) {
      json(response, 200, {
        tasks: [],
        connected: false,
        warning: "Showing an empty dashboard. Add " + missing.join(", ") +
          " to connect the Google Sheet.",
      });
      return;
    }
    try {
      json(response, 200, { tasks: await getTasks(), connected: true });
    } catch (error) {
      // A Sheet outage or permission issue should not prevent the dashboard from opening.
      console.error("Google Sheet task read failed:", error.message);
      json(response, 200, {
        tasks: [],
        connected: false,
        warning: "The Google Sheet is unavailable. Showing an empty dashboard; check the server log.",
      });
    }
    return;
  }

  if (url.pathname === "/api/tasks" && request.method === "POST") {
    const missing = missingSheetSettings();
    if (missing.length) {
      json(response, 503, {
        error: "Task assignment is unavailable until the Sheet is connected. Add " + missing.join(", ") + ".",
      });
      return;
    }
    const body = await readJson(request);
    if (
      typeof body.title !== "string" || !body.title.trim() ||
      typeof body.description !== "string" || !body.description.trim() ||
      !(body.executionMode === "synthetic-eight-agent" ||
        EMPLOYEES.some((employee) => employee.id === body.employeeId)) ||
      !["manual", "synthetic-eight-agent"].includes(body.executionMode || "manual") ||
      !PRIORITIES.includes(body.priority) ||
      (body.deadline && Number.isNaN(Date.parse(body.deadline)))
    ) {
      json(response, 400, { error: "Check the task title, description, employee, priority, and deadline." });
      return;
    }
    const now = new Date().toISOString();
    const task = {
      taskId: crypto.randomUUID(),
      timestamp: now,
      assignedBy: "Boss",
      employeeId: body.executionMode === "synthetic-eight-agent"
        ? "client-manager"
        : body.employeeId,
      description: body.description.trim(),
      priority: body.priority,
      status: "Queued",
      resultLink: "",
      completionTime: "",
      title: body.title.trim(),
      deadline: body.deadline || "",
      blockerReason: "",
      updatedAt: now,
      executionMode: body.executionMode || "manual",
      parentTaskId: "",
      projectId: "",
    };
    await writeTask(task);
    json(response, 201, { task });
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]+)$/i);
  if (taskMatch && request.method === "PATCH") {
    const missing = missingSheetSettings();
    if (missing.length) {
      json(response, 503, {
        error: "Task updates are unavailable until the Sheet is connected. Add " + missing.join(", ") + ".",
      });
      return;
    }
    const body = await readJson(request);
    const tasks = await getTasks();
    const current = tasks.find((task) => task.taskId === taskMatch[1]);
    if (!current) {
      json(response, 404, { error: "Task not found" });
      return;
    }
    if (body.status && !STATUSES.includes(body.status)) {
      json(response, 400, { error: "Choose a valid task status." });
      return;
    }
    if (typeof body.resultLink === "string" && !isWebLink(body.resultLink.trim())) {
      json(response, 400, { error: "Result links must use http or https." });
      return;
    }
    const updated = {
      ...current,
      status: body.status || current.status,
      resultLink: typeof body.resultLink === "string" ? body.resultLink.trim() : current.resultLink,
      blockerReason: typeof body.blockerReason === "string"
        ? body.blockerReason.trim()
        : current.blockerReason,
      completionTime: body.status === "Completed"
        ? (current.status === "Completed" && current.completionTime
          ? current.completionTime
          : new Date().toISOString())
        : body.status ? "" : current.completionTime,
      updatedAt: new Date().toISOString(),
    };
    await writeTask(updated, current.rowNumber);
    json(response, 200, { task: updated });
    return;
  }

  const historyMatch = url.pathname === "/api/chat/history" &&
    request.method === "GET";
  if (historyMatch) {
    const conversationId = url.searchParams.get("conversationId") || "";
    if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
      json(response, 400, { error: "Conversation ID is invalid" });
      return;
    }
    const missing = missingSheetSettings();
    if (missing.length) {
      json(response, 200, { messages: [], connected: false });
      return;
    }
    try {
      json(response, 200, {
        messages: await getChatHistory(conversationId),
        connected: true,
      });
    } catch (error) {
      console.error("Google Sheet chat history read failed:", error.message);
      json(response, 200, { messages: [], connected: false });
    }
    return;
  }

  if (url.pathname === "/api/chat" && request.method === "POST") {
    const missing = missingSheetSettings();
    if (missing.length) {
      json(response, 503, {
        error: "Saved chat is unavailable until the Sheet is connected. Add " + missing.join(", ") + ".",
      });
      return;
    }
    const body = await readJson(request);
    const conversationId = body.conversationId;
    const employeeId = body.employeeId || "";
    const question = typeof body.message === "string" ? body.message.trim() : "";
    if (
      !/^[0-9a-f-]{36}$/i.test(conversationId || "") ||
      !question || question.length > 2000 ||
      (employeeId && !EMPLOYEES.some((employee) => employee.id === employeeId))
    ) {
      json(response, 400, { error: "Check the chat message and selected employee." });
      return;
    }
    const answer = answerFromTasks(question, employeeId, await getTasks());
    await saveChat(conversationId, "Boss", employeeId, question);
    await saveChat(conversationId, employeeId || "project-manager", employeeId, answer);
    json(response, 200, { answer });
    return;
  }

  json(response, 404, { error: "API route not found" });
}

function missingLoginSettings() {
  return ["BOSS_PASSWORD", "SESSION_SECRET"].filter((name) => !process.env[name]);
}

function missingSheetSettings() {
  return ["GOOGLE_SPREADSHEET_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"]
    .filter((name) => !process.env[name]);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://" + (request.headers.host || "localhost"));
    if (url.pathname.startsWith("/api/")) {
      if (missingLoginSettings().length && url.pathname !== "/api/health") {
        json(response, 503, {
          error: "Set up the Boss login before signing in: " + missingLoginSettings().join(", "),
        });
        return;
      }
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end("Method not allowed");
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      await serveFile(response, "index.html", "text/html; charset=utf-8");
    } else if (url.pathname === "/app.css") {
      await serveFile(response, "app.css", "text/css; charset=utf-8");
    } else if (url.pathname === "/app.js") {
      await serveFile(response, "app.js", "text/javascript; charset=utf-8");
    } else {
      response.writeHead(404);
      response.end("Not found");
    }
  } catch (error) {
    const status = error.message === "Request origin is not allowed" ? 403 : 500;
    console.error("Dashboard request failed:", error.message);
    if (!response.headersSent) {
      // Give the dashboard owner a safe, actionable setup message for known
      // configuration errors. Keep unexpected internal errors out of the UI.
      const safeConfigurationErrors = [
        "SESSION_SECRET must be at least 32 characters",
        "Missing required setting: SESSION_SECRET",
        "Missing required setting: BOSS_PASSWORD",
      ];
      const userMessage = status === 403
        ? error.message
        : safeConfigurationErrors.includes(error.message)
          ? "Railway configuration error: " + error.message
          : "The request could not be completed. Check Railway logs.";
      json(response, status, { error: userMessage });
    } else {
      response.end();
    }
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log("Boss dashboard listening on port " + port);
  if (missingLoginSettings().length) {
    console.log("Add these variables to enable Boss sign-in: " + missingLoginSettings().join(", "));
  }
  if (missingSheetSettings().length) {
    console.log("Google Sheet is not connected yet; the dashboard will show an empty state until configured.");
  }
});
