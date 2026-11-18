import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardHandler } from "../server.mjs";

test('live API refresh exposes intermediate specialist progress after two seconds', async t => {
 const keys=['BOSS_PASSWORD','SESSION_SECRET','GOOGLE_SPREADSHEET_ID','GOOGLE_SERVICE_ACCOUNT_JSON'];
 const old=keys.map(key=>process.env[key]);
 Object.assign(process.env,{BOSS_PASSWORD:'local-test-password',SESSION_SECRET:'x'.repeat(40),GOOGLE_SPREADSHEET_ID:'test-book',GOOGLE_SERVICE_ACCOUNT_JSON:'{}'});
 t.after(()=>keys.forEach((key,i)=>old[i]===undefined?delete process.env[key]:process.env[key]=old[i]));
 let time=0, reads=0;
 let tasks=[{taskId:'stage-1',parentTaskId:'stage-1',employeeId:'client-manager',status:'In Progress'}];
 const handler=createDashboardHandler({now:()=>time,loadTasks:async()=>{reads++;return structuredClone(tasks);},loadEvents:async()=>[]});
 const request=async (url,method='GET',body,cookie='')=>{
  let status,headers,value;
  await handler({url,method,headers:{host:'dashboard.test',origin:'http://dashboard.test',cookie},async *[Symbol.asyncIterator](){if(body)yield Buffer.from(JSON.stringify(body));}},
   {headersSent:false,writeHead(code,h){status=code;headers=h;this.headersSent=true;},end(data){value=data;}});
  return {status,headers,data:JSON.parse(value)};
 };
 const login=await request('/api/login','POST',{password:process.env.BOSS_PASSWORD});
 const cookie=login.headers['Set-Cookie'] || login.headers['set-cookie'];
 const session=String(cookie).split(';')[0];
 assert.equal((await request('/api/tasks','GET',null,session)).data.tasks[0].status,'In Progress');
 tasks=[{...tasks[0],status:'Completed'},{taskId:'stage-2',parentTaskId:'stage-1',employeeId:'technical-controls-analyst',status:'In Progress'}];
 time=1000;
 await request('/api/tasks','GET',null,session);
 assert.equal(reads,1);
 time=3000;
 const refreshed=await request('/api/tasks','GET',null,session);
 assert.equal(refreshed.data.tasks.find(t=>t.taskId==='stage-2').status,'In Progress');
 assert.equal(reads,2);
});

test("archive HTTP handler enforces login/origin, persists metadata, and preserves tasks", async t => {
  const vars = { BOSS_PASSWORD: "local-test-password", SESSION_SECRET: "x".repeat(40), GOOGLE_SPREADSHEET_ID: "test-book", GOOGLE_SERVICE_ACCOUNT_JSON: "{}" };
  const old = Object.fromEntries(Object.keys(vars).map(key => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const tasks = [{ taskId: "test-done", employeeId: "client-manager", status: "Blocked", title: "Test", timestamp: "2026-11-16T08:00:00Z" },
    { taskId: "test-running", employeeId: "project-manager", status: "In Progress", timestamp: "2026-11-16T08:00:00Z" },
    { taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", employeeId: "project-manager", status: "Blocked", timestamp: "2026-11-16T08:00:00Z" }];
  const initial = JSON.stringify(tasks);
  const events = [];
  let offline = false;
  let writes = 0;
  const handler = createDashboardHandler({ loadTasks: async () => tasks,
    loadEvents: async () => { if (offline) throw Error("offline"); return events; },
    appendEvents: async rows => { writes++; events.push(...rows.map(([runKey, action, timestamp]) => ({ runKey, action, timestamp }))); } });
  const origin = "http://dashboard.test";
  const fetch = async (url, options = {}) => {
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const request = { url: new URL(url).pathname, method: options.method || "GET", headers: { host: "dashboard.test", ...headers },
      async *[Symbol.asyncIterator]() { if (options.body) yield Buffer.from(options.body); } };
    let status, responseHeaders, data;
    await handler(request, { headersSent: false,
      writeHead(code, values) { status = code; responseHeaders = values; this.headersSent = true; },
      end(value) { data = value; } });
    return { status, headers: { get: name => Object.entries(responseHeaders || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] },
      json: async () => JSON.parse(data) };
  };
  t.after(async () => {
    for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const login = await fetch(origin + "/api/login", { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ password: vars.BOSS_PASSWORD }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const post = (body, headers = {}) => fetch(origin + "/api/runs/archive", { method: "POST", headers: { Origin: origin, Cookie: cookie, ...headers }, body: JSON.stringify(body) });
  const body = { runKeys: ["task:test-done"], action: "archive" };
  assert.equal((await post(body, { Cookie: "" })).status, 401);
  assert.equal((await post(body, { Origin: "https://other.example" })).status, 403);
  assert.equal((await post({ runKeys: ["task:test-running"], action: "archive" })).status, 409);
  assert.equal(writes, 0);
  assert.equal((await post({ runKeys: [], action: "archive" })).status, 400);
  const archived = await post(body);
  assert.deepEqual(await archived.json(), { changed: 1, action: "archive" });
  let data = await (await fetch(origin + "/api/tasks", { headers: { Cookie: cookie } })).json();
  assert.equal(data.tasks.find(task => task.taskId === "test-done").archived, true);
  assert.equal(data.tasks.find(task => task.taskId === "test-running").historical, false);
  assert.equal((await post({ ...body, action: "restore" })).status, 200);
  assert.equal((await post({ runKeys: ["task:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], action: "archive" })).status, 200);
  const patch = await fetch(origin + "/api/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    method: "PATCH", headers: { Origin: origin, Cookie: cookie }, body: JSON.stringify({ status: "Completed" }),
  });
  assert.equal(patch.status, 409);
  assert.equal(JSON.stringify(tasks), initial);
  offline = true;
  data = await (await fetch(origin + "/api/tasks", { headers: { Cookie: cookie } })).json();
  assert.equal(data.archiveAvailable, false);
  assert.equal(data.tasks.length, 3);
  assert.match(data.warning, /unavailable/);
  assert.equal((await post(body)).status, 503);
  for (const file of ["/", "/app.js", "/run-model.js", "/app.css"]) assert.equal((await fetch(origin + file)).status, 200);
});
