import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { decorateRuns, scopedTasks, employeeWork, runStatus, filterRuns, selectRunKeys } from "../public/run-model.js";

// Execute the real page script with an isolated DOM/API model: no real account,
// browser, network or Google Sheet is used by this interaction regression test.
test("page switches scope, previews/cancels archive, archives and restores without editing source tasks", async () => {
  class Element {
    constructor() { this.value = ""; this.hidden = false; this.checked = false; this.disabled = false; this.innerHTML = ""; this.textContent = ""; this.listeners = {}; this.classList = { add() {}, remove() {}, toggle() {} }; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    setAttribute() {}
    insertAdjacentHTML(_position, html) { this.innerHTML += html; }
    closest() { return this; }
    querySelector() { return this; }
    focus() {}
    scrollIntoView() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
  }
  const nodes = new Map();
  const node = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const tasks = [
    { taskId: "old", projectId: "TEST", employeeId: "project-manager", title: '<script>alert("test")</script>', description: "Historical failed test", status: "Blocked", priority: "Normal", timestamp: "2026-11-12T08:00:00Z" },
    { taskId: "latest", projectId: "TEST", employeeId: "project-manager", title: "Current report", description: "Validated", status: "Completed", priority: "Normal", timestamp: "2026-11-16T08:00:00Z" },
    { taskId: "abandoned", projectId: "OLDTEST", employeeId: "client-manager", executionMode: "email-intake", title: "Old test", description: "No evidence", status: "Blocked", priority: "Normal", timestamp: "2026-11-13T08:00:00Z" },
  ];
  const original = JSON.stringify(tasks);
  const events = [];
  const writes = [];
  const local = new Map();
  const documentEvents = {}, windowEvents = {};
  const context = vm.createContext({ scopedTasks, employeeWork, runStatus, filterRuns, selectRunKeys, crypto: webcrypto, URL, Blob,
    localStorage: { getItem: key => local.get(key), setItem: (key, value) => local.set(key, value) },
    document: { querySelector: node, visibilityState: "visible", addEventListener(type, fn) { documentEvents[type] = fn; } },
    window: { location: { hash: '' }, scrollTo() {}, addEventListener(type, fn) { windowEvents[type] = fn; } }, setInterval() {},
    fetch: async (url, options = {}) => {
      if (url === "/api/tasks") return new Response(JSON.stringify({ ...decorateRuns(tasks, events), connected: true, archiveAvailable: true }));
      if (url.startsWith("/api/chat/history")) return new Response(JSON.stringify({ messages: [] }));
      if (url === "/api/runs/archive") {
        const body = JSON.parse(options.body); writes.push(body);
        for (const runKey of body.runKeys) events.push({ runKey, action: body.action });
        return new Response(JSON.stringify({ changed: body.runKeys.length }));
      }
      assert.fail("Unexpected API call " + url);
    },
  });
  const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/^import .*run-model.js.*;\r?\n/m, "");
  vm.runInContext(source, context);
  const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
  await settle();
  assert.equal(String(node("#count-blocked").textContent), "1");
  assert.ok(!node("#task-list").innerHTML.includes("Historical failed test"));
  const selected = () => Array.from(vm.runInContext("state.selectedRuns", context));
  await node("#select-blocked").listeners.click();
  assert.deepEqual(selected(), ["task:abandoned"]);
  await node("#select-completed").listeners.click();
  assert.deepEqual(selected(), ["task:latest"]); // Replace, never add to blocked selection.
  await node("#clear-run-selection").listeners.click();
  assert.deepEqual(selected(), []);
  await node("#filter-run-state").listeners.change({ target: { value: "blocked" } });
  assert.ok(!node("#run-list").innerHTML.includes("Current report"));
  await node("#select-all-runs").listeners.click();
  assert.deepEqual(selected(), ["task:abandoned"]); // Only shown runs.
  await node("#run-search").listeners.input({ target: { value: "no matching run" } });
  assert.deepEqual(selected(), []);
  assert.match(node("#run-list").innerHTML, /No runs/);
  await node("#clear-run-filters").listeners.click();
  assert.ok(node("#run-list").innerHTML.includes("Current report"));
  await node("#view-history").listeners.click();
  assert.ok(node("#task-list").innerHTML.includes("Historical failed test"));
  assert.ok(node("#task-list").innerHTML.includes("&lt;script&gt;"));
  assert.ok(!node("#task-list").innerHTML.includes("save-task"));
  await node("#view-current").listeners.click();
  vm.runInContext('state.selectedRuns.add("task:abandoned"); renderSelection();', context);
  await node("#archive-runs").listeners.click();
  assert.equal(node("#archive-dialog").open, true);
  assert.match(node("#archive-preview").textContent, /1 run\(s\), containing 1/);
  await node("#archive-cancel").listeners.click();
  assert.equal(writes.length, 0);
  await node("#archive-runs").listeners.click();
  await node("#archive-confirm").listeners.click();
  assert.equal(writes.length, 1);
  assert.equal(String(node("#count-blocked").textContent), "0");
  await node("#view-history").listeners.click();
  await node("#filter-run-state").listeners.change({ target: { value: "archived" } });
  assert.ok(node("#run-list").innerHTML.includes("OLDTEST"));
  assert.ok(!node("#run-list").innerHTML.includes("Historical failed test"));
  await node("#select-archived").listeners.click();
  assert.deepEqual(selected(), ["task:abandoned"]);
  await node("#clear-run-filters").listeners.click();
  vm.runInContext('state.selectedRuns.add("task:abandoned"); renderSelection();', context);
  await node("#restore-runs").listeners.click();
  await node("#archive-confirm").listeners.click();
  assert.equal(writes[1].action, "restore");
  await node("#view-current").listeners.click();
  assert.equal(String(node("#count-blocked").textContent), "1");
  assert.equal(JSON.stringify(tasks), original);
  // Menu routes render separate workspaces without writing or changing task data.
  const writeCount=writes.length;
  vm.runInContext('navigate("team", false)',context);
  assert.equal(node('#employees').hidden,false);
  assert.equal(node('#overview').hidden,true);
  assert.equal(node('#tasks').hidden,true);
  assert.equal(node('#page-title').textContent,'Team');
  assert.match(node('#employee-cards').innerHTML,/<tr><th scope="row">/);
  assert.ok(!node('#employee-cards').innerHTML.includes('employee-card'));
  vm.runInContext('navigate("requests", false)',context);
  assert.equal(node('#requests').hidden,false);
  assert.match(node('#request-list').innerHTML,/OLDTEST/);
  assert.ok(!node('#request-list').innerHTML.includes('Current report'));
  documentEvents.click({target:{closest:()=>({dataset:{openRun:'task:latest'}})}});
  assert.equal(node('#page-title').textContent,'Projects & tasks');
  assert.equal(vm.runInContext('state.runKey',context),'task:latest');
  assert.match(node('#task-list').innerHTML,/Current report/);
  assert.ok(!node('#task-list').innerHTML.includes('No evidence'));
  context.window.location.hash='#team';
  windowEvents.hashchange();
  assert.equal(node('#page-title').textContent,'Team');
  vm.runInContext('navigate("history", false)',context);
  assert.equal(node('#projects').hidden,false);
  assert.equal(node('#tasks').hidden,false);
  assert.match(node('#task-list').innerHTML,/Historical failed test/);
  assert.equal(node('#run-management').hidden,false);
  vm.runInContext('navigate("reports", false)',context);
  assert.equal(node('#reports').hidden,false);
  assert.equal(node('#employees').hidden,true);
  vm.runInContext('navigate("assign", false)',context);
  assert.equal(node('#assign').hidden,false);
  assert.equal(node('#scope-panel').hidden,true);
  vm.runInContext('navigate("employees", false)',context);
  assert.equal(node('#page-title').textContent,'Team'); // Legacy bookmarks.
  vm.runInContext('navigate("unknown", false)',context);
  assert.equal(node('#overview').hidden,false);
  assert.equal(writes.length,writeCount);
  assert.equal(JSON.stringify(tasks),original);
});
