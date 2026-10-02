/**
 * The scripted smoke runner: `node test/smoke/run-smoke.ts [--only P1,P8]`. It starts a scratch Paseo daemon on its
 * own home and port, installs a smoke copy of the plugin as `mwp-smoke`, runs probes P1 to P12 and writes one result
 * line per section under `## Results` of `test/smoke/README.md`. Every `paseo` call carries `--home <scratch>`; the
 * environment of every child is built by `scrubEnv`, so no owner value reaches the scratch daemon. On exit, also
 * after a failure or an interrupt, it stops the scratch daemon and deletes the scratch home.
 *
 * Not a test file: its name does not match `test/**\/*.test.ts`, so `npm test` never starts it.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { availableParallelism, release, tmpdir, type as osType } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HUMAN_STEPS, PROBES, SECTIONS, scrubEnv, withResults, withSectionResults, type Result, type Status } from "./smoke-plan.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const README = join(ROOT, "test", "smoke", "README.md");
const MODEL = "claude/claude-haiku-4-5";
const TAG = "[mwp-smoke]";
const ONLY = (() => {
  const at = process.argv.indexOf("--only");
  return at === -1 ? null : new Set((process.argv[at + 1] ?? "").split(","));
})();

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const log = (text: string) => console.log(`[smoke ${new Date().toISOString().slice(11, 19)}] ${text}`);

// ---------------------------------------------------------------- the scratch layout

const BASE = process.env["MWP_SMOKE_TEMP"] ?? tmpdir();
const RUN = join(BASE, `plugin-real-host-smoke-${Math.random().toString(16).slice(2, 8)}`);
const HOME = join(RUN, "plugin-real-host-home");
const COPY = join(RUN, "plugin-real-host-copy");
const STATE = join(RUN, "plugin-real-host-state");
const WORK = join(RUN, "plugin-real-host-work");
const CLAUDE_CONFIG = join(RUN, "plugin-real-host-claude-config");
const REPO_P5 = join(RUN, "plugin-real-host-repo-p5");
const REPO_SPEND = join(RUN, "plugin-real-host-repo-spend");
const REPOS = [REPO_P5, REPO_SPEND];

// ---------------------------------------------------------------- calling paseo

/** The Paseo CLI as a command and its leading arguments: the bundled app on Windows, `paseo` elsewhere. */
function resolvePaseo(): { cmd: string; pre: string[]; env: Record<string, string> } {
  if (process.platform === "win32") {
    const app = join(process.env["LOCALAPPDATA"] ?? "", "Programs", "Paseo");
    const exe = join(app, "Paseo.exe");
    const entry = join(app, "resources", "app.asar.unpacked", "dist", "daemon", "node-entrypoint-runner.js");
    const cli = join(app, "resources", "app.asar", "node_modules", "@getpaseo", "cli", "dist", "index.js");
    if (existsSync(exe)) {
      return { cmd: exe, pre: ["--disable-warning=DEP0040", entry, "node-script", cli], env: { ELECTRON_RUN_AS_NODE: "1", PASEO_NODE_ENV: "production" } };
    }
  }
  return { cmd: "paseo", pre: [], env: {} };
}
const PASEO = resolvePaseo();

/** The names of the owner's keys removed, printed once; never a value. */
let removedNames: string[] = [];

/** The environment of a child: the runner's own without the owner's keys and `MWP_*`, then the scratch values. */
function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const own = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("MWP_")));
  const scrubbed = scrubEnv(own, { ...PASEO.env, ...extra });
  removedNames = scrubbed.removed;
  return scrubbed.env;
}

type Out = { code: number | null; stdout: string; stderr: string };

function exec(cmd: string, args: string[], env: Record<string, string>, timeoutMs: number, cwd?: string): Promise<Out> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { env, cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ code: null, stdout, stderr: String(error) });
    });
  });
}

let launchEnv: Record<string, string> = {};
let PORT = 0;

/** `paseo <args> --home <scratch>`; `parent` is the scratch agent the new agent becomes a child of. */
function paseo(args: string[], options: { parent?: string; timeoutMs?: number } = {}): Promise<Out> {
  const extra: Record<string, string> = options.parent === undefined ? {} : { PASEO_AGENT_ID: options.parent };
  return exec(PASEO.cmd, [...PASEO.pre, ...args, "--home", HOME], childEnv(extra), options.timeoutMs ?? 180_000);
}

function paseoSync(args: string[], timeoutMs = 90_000): { status: number | null; stdout: string } {
  const result = spawnSync(PASEO.cmd, [...PASEO.pre, ...args, "--home", HOME], { env: childEnv(), encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return { status: result.status, stdout: result.stdout ?? "" };
}

// ---------------------------------------------------------------- the daemon

let daemonChild: ChildProcess | null = null;
let startMode: "start" | "run" = "start";

async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => (port === 6767 || port === 6790 ? fail(new Error("unlucky port")) : done(port)));
    });
  });
}

async function startDaemon(mwp: Record<string, string>, mode: "start" | "run"): Promise<void> {
  launchEnv = mwp;
  startMode = mode;
  const env = childEnv(mwp);
  if (mode === "run") {
    daemonChild = spawn(PASEO.cmd, [...PASEO.pre, "daemon", "run", "--home", HOME], { env, detached: true, stdio: "ignore", windowsHide: true });
    daemonChild.unref();
  } else {
    const out = await exec(PASEO.cmd, [...PASEO.pre, "daemon", "start", "--home", HOME], env, 240_000);
    if (out.code !== 0) throw new Error(`daemon start failed: ${out.stderr.slice(0, 300)}`);
  }
  for (let i = 0; i < 60; i++) {
    const status = await paseo(["daemon", "status"], { timeoutMs: 30_000 });
    if (/localDaemon: running/.test(status.stdout) && /connectedDaemon: reachable/.test(status.stdout)) return;
    await sleep(3000);
  }
  throw new Error("the scratch daemon did not become reachable");
}

async function stopDaemon(): Promise<string> {
  const out = await paseo(["daemon", "stop"], { timeoutMs: 120_000 });
  return `${out.stdout.trim()} ${out.stderr.trim()}`.trim();
}

// ---------------------------------------------------------------- agents and timelines

const pending = new Set<string>();

async function newAgent(o: { title: string; labels?: Record<string, string>; parent?: string; prompt: string; cwd?: string; mode?: string; env?: Record<string, string> }): Promise<string> {
  if (!o.title.includes(TAG)) throw new Error(`agent title lacks ${TAG}: ${o.title}`);
  const args = ["run", "-d", "--json", "--title", o.title, "--provider", MODEL, "--mode", o.mode ?? "bypassPermissions", "--cwd", o.cwd ?? WORK];
  for (const [k, v] of Object.entries(o.labels ?? {})) args.push("--label", `${k}=${v}`);
  for (const [k, v] of Object.entries(o.env ?? {})) args.push("--env", `${k}=${v}`);
  args.push(o.prompt);
  const out = await paseo(args, { parent: o.parent });
  const id = /"agentId":\s*"([0-9a-f-]{36})"/.exec(out.stdout)?.[1];
  if (id === undefined) throw new Error(`agent not created (${o.title}): ${(out.stdout + out.stderr).slice(0, 300)}`);
  return id;
}

const waitIdle = (id: string, seconds = 240) => paseo(["wait", id, "--timeout", String(seconds)], { timeoutMs: (seconds + 30) * 1000 });

async function logsOf(id: string): Promise<string> {
  return (await paseo(["logs", id, "--json"], { timeoutMs: 120_000 })).stdout;
}

async function statusOf(id: string): Promise<string> {
  const out = (await paseo(["inspect", id, "--json"])).stdout;
  return /"Status":\s*"([a-z_]+)"/.exec(out)?.[1] ?? "unknown";
}

async function inspectField(id: string, field: string): Promise<string> {
  const out = (await paseo(["inspect", id, "--json"])).stdout;
  return new RegExp(`"${field}":\\s*("?[^,\\n]*"?)`).exec(out)?.[1] ?? "";
}

const count = (text: string, needle: string | RegExp): number =>
  typeof needle === "string" ? text.split(needle).length - 1 : (text.match(new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`)) ?? []).length;

/** Polls `read` until `ok` accepts its text, or the time is up; returns the last text read. */
async function until(read: () => Promise<string>, ok: (text: string) => boolean, seconds: number): Promise<string> {
  const end = Date.now() + seconds * 1000;
  let text = await read();
  while (!ok(text) && Date.now() < end) {
    await sleep(5000);
    text = await read();
  }
  return text;
}

const SILENT_ORCHESTRATOR = "You are a passive log. For this message and for every message you receive afterwards, reply with exactly the word noted, and never call any tool.";

function orchestrator(name: string, labels?: Record<string, string>, cwd?: string): Promise<string> {
  return newAgent({ title: `${TAG} orchestrator ${name}`, labels, cwd, prompt: SILENT_ORCHESTRATOR });
}

/** The tail of a text, cut to what a result line can hold. */
const brief = (text: string, n = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}...` : flat;
};

class Checks {
  private lines: string[] = [];
  failed = false;
  check(name: string, ok: boolean, detail = ""): void {
    if (!ok) this.failed = true;
    const shown = !ok || detail.length <= 80 ? detail : "";
    this.lines.push(`${ok ? "ok" : "FAIL"} ${name}${shown === "" ? "" : ` (${brief(shown, ok ? 80 : process.env["MWP_SMOKE_DEBUG"] === undefined ? 300 : 2000)})`}`);
  }
  note(text: string): void {
    this.lines.push(text);
  }
  done(blocked?: string): { status: Status; evidence: string } {
    const evidence = this.lines.join("; ");
    return { status: blocked !== undefined ? `blocked: ${blocked}` : this.failed ? "fail" : "pass", evidence };
  }
}

// ---------------------------------------------------------------- probes

type ProbeResult = { status: Status; evidence: string };
const probeResults = new Map<string, ProbeResult>();
let pluginId = "mwp-smoke";

async function pluginLogs(): Promise<string> {
  const out = await paseo(["plugin", "logs", pluginId]);
  return out.stdout + out.stderr;
}

async function stateFiles(): Promise<string[]> {
  return existsSync(STATE) ? readdirSync(STATE) : [];
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

async function p1(): Promise<ProbeResult> {
  const c = new Checks();
  const providers = async () => (await paseo(["provider", "ls", "--json"])).stdout.match(/"provider":\s*"[a-z]+"/g)?.sort().join(",") ?? "";
  const before = await providers();
  const install = await paseo(["plugin", "install", COPY, "--id", pluginId]);
  c.check("install exits 0", install.code === 0, install.stdout + install.stderr);
  const ls = await paseo(["plugin", "ls"]);
  c.check("ls shows mwp-smoke running", /mwp-smoke\s+running/.test(ls.stdout), ls.stdout);
  const logs = await pluginLogs();
  c.check("logs hold no [matt-with-paseo] line", !logs.includes("[matt-with-paseo]"), logs);
  c.check("logs hold Plugin ready", logs.includes("Plugin ready"), logs);
  const after = await providers();
  c.check("provider ids the same with the plugin installed", before !== "" && before === after, `${before} | ${after}`);
  const removed = await paseo(["plugin", "remove", pluginId]);
  const lsAfter = await paseo(["plugin", "ls"]);
  c.check("remove exits 0 and ls no longer lists it", removed.code === 0 && !lsAfter.stdout.includes("mwp-smoke"), removed.stdout + removed.stderr);
  const again = await paseo(["plugin", "install", COPY, "--id", pluginId]);
  c.check("a second install runs", again.code === 0, again.stdout + again.stderr);
  const lsRepeat = await paseo(["plugin", "ls"]);
  c.check("running again", /mwp-smoke\s+running/.test(lsRepeat.stdout), lsRepeat.stdout);
  return c.done();
}

async function p8(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("gate");
  await waitIdle(o);
  const sleeper = (n: string, ticket: string) =>
    newAgent({ title: `${TAG} ticket ${n}`, labels: { wave: "1", ticket }, parent: o, prompt: "Run the shell command: sleep 40 . Then reply with exactly the word done." });
  const a = await sleeper("A", "98");
  const aRunning = await until(() => statusOf(a), (s) => s === "running", 60);
  c.check("A runs", aRunning === "running", aRunning);
  const b = await sleeper("B", "99");
  const text = await until(() => logsOf(o), (t) => t.includes("Gate cap passed:"), 120);
  c.check("one Gate cap passed names ticket 99 and a cap of 1", count(text, "Gate cap passed:") === 1 && /Gate cap passed: ticket 99[^\n]*2 ticket agents run against a cap of 1 concurrent gates/.test(text), text.slice(text.indexOf("Gate cap passed:"), text.indexOf("Gate cap passed:") + 200));
  c.check("a Next: line ends it", /Gate cap passed:[\s\S]*?\nNext: /.test(text));
  await waitIdle(a);
  await waitIdle(b);
  await paseo(["archive", a]);
  const before = count(await logsOf(o), "Gate cap passed:");
  const cAgent = await newAgent({ title: `${TAG} ticket C`, labels: { wave: "1", ticket: "97" }, parent: o, prompt: "Reply with exactly the word done." });
  await waitIdle(cAgent);
  await sleep(20_000);
  const final = await logsOf(o);
  c.check("the idle third adds no Gate cap passed", count(final, "Gate cap passed:") === before, `${before} -> ${count(final, "Gate cap passed:")}`);
  c.note(`MWP_GATE_SHARE=0.01 reached plugin code through daemon ${startMode}`);
  return c.done();
}

async function p10(): Promise<ProbeResult> {
  const c = new Checks();
  rmSync(join(STATE, "question-budget.json"), { force: true });
  await paseo(["plugin", "reload", pluginId]);
  const o = await orchestrator("budget", { stream: "demo10" }, REPO_P5);
  await waitIdle(o);
  const ask = (n: string, ticket: string) =>
    newAgent({
      title: `${TAG} ticket ${n}`,
      labels: { stream: "demo10", wave: "1", ticket },
      parent: o,
      cwd: REPO_P5,
      mode: "default",
      prompt: `Use the AskUserQuestion tool once with one question. header: "Budget". question text, two lines: "Which one? ${n}" then "Door: one-way". Two options: "Yes" and "No".`,
    });
  const t1 = await ask("one", "98");
  await until(async () => read(join(STATE, "question-budget.json")), (t) => t.includes('"count":1'), 150);
  const first = read(join(STATE, "question-budget.json"));
  c.check("after one question the file holds count 1", first.includes('"count":1') && first.includes('"notified":false'), first);
  c.check("no Question budget spent yet", !(await logsOf(o)).includes("Question budget spent:"));
  const t2 = await ask("two", "99");
  const text = await until(() => logsOf(o), (t) => t.includes("Question budget spent:"), 150);
  c.check("one Question budget spent: 2 ... budget of 2", count(text, "Question budget spent:") === 1 && /Question budget spent: 2 questions reached the user today against a budget of 2\./.test(text), text.slice(text.indexOf("Question budget spent:"), text.indexOf("Question budget spent:") + 140));
  const second = read(join(STATE, "question-budget.json"));
  c.check("the file holds count 2 and notified", second.includes('"count":2') && second.includes('"notified":true'), second);
  await paseo(["stop", t1]);
  await paseo(["stop", t2]);
  return c.done();
}

async function p2(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("relay");
  await waitIdle(o);
  const t1 = await newAgent({ title: `${TAG} ticket`, labels: { wave: "1", ticket: "99" }, parent: o, prompt: "Reply with exactly the word done." });
  await waitIdle(t1);
  let text = await until(() => logsOf(o), (t) => t.includes("Turn ended:"), 90);
  c.check("Agent created: arrives", text.includes("Agent created: ticket 99 of wave 1"), text);
  c.check("Turn ended: names ticket 99, wave 1, completed, with no heartbeat", /Turn ended: ticket 99 of wave 1, agent [0-9a-f-]+, outcome completed/.test(text));
  c.check("the orchestrator's own turn end adds none", count(text, "Turn ended:") === 1, String(count(text, "Turn ended:")));
  const names = ["get_agent_activity", "list_pending_permissions", "respond_to_permission"];
  const next = text.slice(text.indexOf("Turn ended:"));
  c.check("a Next: line names get_agent_activity", /\nNext: [^\n]*get_agent_activity/.test(next));
  c.note(`Next: tools named: ${names.filter((n) => text.includes(n)).join(",")} (their existence on the daemon is not checked: the CLI lists no MCP tools)`);
  const t2 = await newAgent({
    title: `${TAG} ticket question`,
    labels: { wave: "1", ticket: "98" },
    parent: o,
    mode: "default",
    prompt: 'Use the AskUserQuestion tool once. header: "Colour". question text: "Which colour QTXT-7431?". Two options: "Red" and "Blue".',
  });
  text = await until(() => logsOf(o), (t) => t.includes("Permission pending:"), 150);
  c.check("Permission pending: names AskUserQuestion and a request id", /Permission pending: ticket 98 of wave 1, agent [0-9a-f-]+, request \S+, AskUserQuestion \(question\)/.test(text), text.slice(text.indexOf("Permission pending:"), text.indexOf("Permission pending:") + 200));
  c.check("the question text is not in the message", !text.includes("QTXT-7431"));
  await paseo(["stop", t2]);
  const quiet = count(await logsOf(o), /(Turn ended|Permission pending|Agent created):/);
  const u1 = await newAgent({ title: `${TAG} plain`, parent: o, prompt: "Reply with exactly the word done." });
  const u2 = await newAgent({ title: `${TAG} wave only`, labels: { wave: "1" }, parent: o, prompt: "Reply with exactly the word done." });
  await waitIdle(u1);
  await waitIdle(u2);
  await sleep(15_000);
  const settled = await logsOf(o);
  c.check("unlabelled and wave-only agents add no message", !settled.includes("done") || count(settled, "agent " + u1) === 0, "");
  c.check("their ids appear in no relay message", !new RegExp(`(Turn ended|Permission pending|Agent created)[^\\n]*${u1}`).test(settled) && !new RegExp(`(Turn ended|Permission pending|Agent created)[^\\n]*${u2}`).test(settled));
  void quiet;
  await paseo(["archive", t1]);
  text = await until(() => logsOf(o), (t) => t.includes("Agent archived:"), 60);
  c.check("Agent archived: arrives", text.includes("Agent archived: ticket 99 of wave 1"));
  const fixture = join(ROOT, "test", "smoke", "fixtures", "paseo-0.10.1");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "P2-relay-orchestrator-timeline.txt"), settled.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<agent-id>"));
  c.note("orchestrator timeline saved as test/smoke/fixtures/paseo-0.10.1/P2-relay-orchestrator-timeline.txt");
  return c.done();
}

async function p4(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("human");
  await waitIdle(o);
  const t = await newAgent({ title: `${TAG} ticket`, labels: { wave: "1", ticket: "99" }, parent: o, prompt: "Reply with exactly the word first." });
  await waitIdle(t);
  await sleep(10_000);
  const first = await logsOf(o);
  c.check("create path (CLI run with the orchestrator as parent): a Turn ended: and no Human words:", first.includes("Turn ended:") && !first.includes("Human words:"), first);
  const sent = await paseo(["send", t, "Reply with exactly the word second."]);
  c.check("CLI send exits 0", sent.code === 0, sent.stdout + sent.stderr);
  await sleep(10_000);
  const relay = await logsOf(o);
  const humanBefore = count(relay, "Human words:");
  c.note(`CLI send (also with PASEO_AGENT_ID set to the orchestrator): ${humanBefore > 0 ? "carries a clientMessageId, counted as a person's (Human words: arrived)" : "carries no clientMessageId, not counted as a person's"}`);
  const text = await logsOf(t);
  const fixture = join(ROOT, "test", "smoke", "fixtures", "paseo-0.10.1");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "P4-human-words-ticket-timeline.txt"), text.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<agent-id>"));
  writeFileSync(join(fixture, "P4-human-words-orchestrator-timeline.txt"), relay.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<agent-id>"));
  c.note("the CLI timeline text shows no messageId or clientMessageId fields; both timelines saved under fixtures/paseo-0.10.1/");
  const turnsBefore = count(relay, "Turn ended: ticket 99");
  const sdk = await newAgent({
    title: `${TAG} mcp orchestrator`,
    prompt: `Use your paseo MCP tools for two steps. Step 1: call create_agent with title "${TAG} mcp child", labels wave=1 and ticket=96, provider claude, model claude-haiku-4-5, working directory ${WORK.replaceAll("\\", "/")}, and the initial prompt "Reply with exactly the word ok". Step 2: call send_agent_prompt on agent ${t} with the prompt "Reply with exactly the word third". Then reply with exactly the word created.`,
  });
  await waitIdle(sdk, 240);
  const listed = (await paseo(["ls", "--json", "--label", "ticket=96"])).stdout;
  if (!listed.includes("mcp child")) {
    c.note("not covered: an agent could not create a child or send a prompt through its MCP tools on this daemon");
  } else {
    c.note("create_agent through MCP created a child with the ticket labels");
    const mcpLog = await until(() => logsOf(sdk), (x) => x.includes("Turn ended: ticket 96"), 90);
    c.check("MCP create_agent path: a Turn ended: for the child and no Human words:", mcpLog.includes("Turn ended: ticket 96") && !mcpLog.includes("Human words:"), mcpLog);
    const after = await until(() => logsOf(o), (x) => count(x, "Turn ended: ticket 99") > turnsBefore, 90);
    c.check("MCP send_agent_prompt path: a new Turn ended: and no new Human words:", count(after, "Turn ended: ticket 99") > turnsBefore && count(after, "Human words:") === humanBefore, `${humanBefore} -> ${count(after, "Human words:")}`);
  }
  c.note("the app-typed message is a human step");
  return c.done();
}

async function p5(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("answer", undefined, REPO_P5);
  await waitIdle(o);
  const two = await newAgent({
    title: `${TAG} ticket two-way`,
    labels: { wave: "1", ticket: "99" },
    parent: o,
    cwd: REPO_P5,
    mode: "default",
    prompt: `Call the AskUserQuestion tool once with exactly this input and no other change: {"questions":[{"header":"Colour","question":"Which colour QTXT-5555?\\nDoor: two-way","multiSelect":false,"options":[{"label":"Red (Recommended)","description":"warm"},{"label":"Blue","description":"cold"}]}]} When you receive the answer, reply with exactly CHOSE:<the label you were given>:END`,
  });
  const text = await until(() => logsOf(two), (t) => /CHOSE:[^<\n]*:END/.test(t), 180);
  c.check("the two-way question is answered with the recommendation", /CHOSE:Red \(Recommended\):END/.test(text), text.slice(-400) + " // plugin log: " + (await pluginLogs()).slice(-300));
  const jsonl = read(join(STATE, "delegated-answers.jsonl"));
  c.check("delegated-answers.jsonl holds the Colour answer, no question text", jsonl.includes('"header":"Colour"') && !jsonl.includes("QTXT-5555"), jsonl);
  const one = await newAgent({
    title: `${TAG} ticket one-way`,
    labels: { wave: "1", ticket: "98" },
    parent: o,
    cwd: REPO_P5,
    mode: "default",
    prompt: `Call the AskUserQuestion tool once with exactly this input and no other change: {"questions":[{"header":"Gate","question":"Proceed QTXT-6666?\\nDoor: one-way","multiSelect":false,"options":[{"label":"Go (Recommended)","description":"yes"},{"label":"Stop","description":"no"}]}]} When you receive the answer, reply with exactly CHOSE:<the label you were given>:END`,
  });
  await sleep(60_000);
  const waiting = (await paseo(["permit", "ls", "--json"])).stdout;
  c.check("the one-way question waits as a pending permission", waiting.includes(one) || waiting.toLowerCase().includes("askuserquestion"), waiting);
  c.check("the one-way agent has not been answered", !/CHOSE:[^<\n]*:END/.test(await logsOf(one)));
  await paseo(["stop", one]);
  const logs = await pluginLogs();
  c.check("the plugin log holds no question text", !logs.includes("QTXT-"));
  return c.done();
}

async function p6(): Promise<ProbeResult> {
  const c = new Checks();
  rmSync(join(STATE, "stream-spend.json"), { force: true });
  const o = await orchestrator("cost", undefined, REPO_SPEND);
  await waitIdle(o);
  const t = await newAgent({ title: `${TAG} ticket`, labels: { stream: "cost6", wave: "1", ticket: "99" }, parent: o, cwd: REPO_SPEND, prompt: "Reply with exactly the word done." });
  await waitIdle(t);
  await sleep(8000);
  const cost = Number(/"CostUsd":\s*([0-9.eE-]+)/.exec((await paseo(["inspect", t, "--json"])).stdout)?.[1] ?? "NaN");
  const spend = read(join(STATE, "stream-spend.json"));
  const total = Number(/"cost6":\{"totalUsd":([0-9.eE-]+)/.exec(spend)?.[1] ?? "NaN");
  c.check("stream-spend.json totalUsd equals lastUsage cost", Number.isFinite(cost) && Math.abs(total - cost) < 1e-9, `${total} vs ${cost}`);
  const text = await until(() => logsOf(o), (x) => x.includes("Appetite passed:"), 90);
  c.check("Appetite passed: once", count(text, "Appetite passed: stream cost6") === 1, String(count(text, "Appetite passed:")));
  await paseo(["send", t, "Reply with exactly the word again."]);
  await sleep(15_000);
  c.check("still once after a second turn", count(await logsOf(o), "Appetite passed: stream cost6") === 1);
  c.check("presets/cost-levels.json is in the smoke copy", existsSync(join(COPY, "presets", "cost-levels.json")));
  c.note("list_profiles is an MCP tool the CLI cannot call: compared provider ids instead (P1)");
  return c.done();
}

async function p11(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("card", undefined, REPO_SPEND);
  await waitIdle(o);
  const t = await newAgent({ title: `${TAG} ticket`, labels: { stream: "card11", wave: "1", ticket: "99" }, parent: o, cwd: REPO_SPEND, prompt: "Reply with exactly the word done." });
  await waitIdle(t);
  await sleep(10_000);
  const logs = await pluginLogs();
  c.check("the plugin logged no report card failure", !logs.includes("report card not appended"), logs);
  let shownIn = "";
  for (const format of ["json", "yaml"]) {
    const alt = (await paseo(["logs", o, "-o", format], { timeoutMs: 120_000 })).stdout;
    if (/report-card/.test(alt)) shownIn = format;
  }
  if (/report-card/.test(await logsOf(o))) shownIn = "text";
  if (shownIn === "") c.note("the CLI timeline of the stream agent shows no plugin rows in text, json or yaml, so the row's kind and version are not read: human step");
  else c.check("the stream agent's timeline carries the report-card row", true, shownIn);
  await paseo(["plugin", "reload", pluginId]);
  await paseo(["send", t, "Reply with exactly the word again."]);
  await waitIdle(t);
  await sleep(10_000);
  const after = await pluginLogs();
  c.check("after a reload the next turn refreshes the card without a failure", !after.includes("report card not appended"));
  c.note("the card's drawing and its lack of a button are a human step");
  const done = c.done();
  return shownIn === "" && done.status === "pass" ? { status: "human", evidence: done.evidence } : done;
}

/** P7 runs beside the other probes: three agents that sleep, and the messages the sensor sends about them. */
async function p7(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("sensor");
  await waitIdle(o);
  // #62: the agents' Bash shell on the scratch daemon finds no `node` (exit 127), and Claude Code refuses a standalone
  // foreground `sleep`; either ends the turn at once. A shell loop of one-second sleeps is one stuck call, 9 minutes
  // under the tool's default timeout cap of 600000 ms.
  const prompt = "Call the Bash tool exactly once, in the foreground (run_in_background false), with the parameter timeout set to 600000 and this command: i=0; while [ $i -lt 540 ]; do sleep 1; i=$((i+1)); done; echo finished . The command takes 9 minutes: wait for it, do not stop it, call no other tool. When it returns, reply with exactly the word done.";
  const start = Date.now();
  const stream = await newAgent({ title: `${TAG} stream`, labels: { stream: "sensor7" }, parent: o, prompt });
  const ticket = await newAgent({ title: `${TAG} ticket`, labels: { wave: "1", ticket: "98" }, parent: o, prompt });
  const bundle = await newAgent({ title: `${TAG} bundle`, labels: { wave: "1", bundle: "97", tickets: "97,98" }, parent: o, prompt });
  const agents = [stream, ticket, bundle];
  const roles = ["stream", "ticket", "bundle"];
  const field = "UpdatedAt";
  /** Checks all three are running; the tail of the timeline of any that is not goes into the evidence. */
  async function running(minute: number): Promise<boolean> {
    const states = await Promise.all(agents.map((id) => statusOf(id)));
    c.check(`the three agents are still running at minute ${minute} (a stuck call, not a finished turn)`, states.every((s) => s === "running"), states.join(","));
    for (const [i, id] of agents.entries()) {
      if (states[i] !== "running") c.note(`${roles[i]} agent's timeline ends: ${brief((await logsOf(id)).slice(-300), 300)}`);
    }
    return states.every((s) => s === "running");
  }
  await sleep(Math.max(0, start + 120_000 - Date.now()));
  const at2 = await inspectField(stream, field);
  if (!(await running(2))) return c.done();
  await sleep(Math.max(0, start + 420_000 - Date.now()));
  const at7 = await inspectField(stream, field);
  await running(7);
  c.check(`${field} read at minute 2 and minute 7 is equal while the call is stuck`, at2 !== "" && at2 === at7, `${at2} | ${at7}`);
  const wanted = [`Stall suspected: stream sensor7, agent ${stream}`, `Stall suspected: ticket 98 of wave 1, agent ${ticket}`, `Stall suspected: bundle 97 (tickets 97,98) of wave 1, agent ${bundle}`];
  await until(() => logsOf(o), (t) => wanted.every((w) => t.includes(w)), Math.max(30, (start + 700_000 - Date.now()) / 1000));
  await sleep(Math.max(0, start + 760_000 - Date.now()));
  const flagged = await logsOf(o);
  wanted.forEach((w, i) => c.check(`${["stream", "ticket", "bundle"][i]} agent flagged exactly once during the sleep`, count(flagged, w) === 1, String(count(flagged, w))));
  c.check("the body says its turn has run with no new activity, with the never-prompt Next: line", /no new activity/.test(flagged) && /never prompt it/.test(flagged));
  for (const id of [stream, ticket, bundle]) await waitIdle(id, 300);
  const ended = count(await logsOf(o), "Stall suspected:");
  await sleep(6.5 * 60_000);
  const last = await logsOf(o);
  c.check("no Stall suspected: after the sleep ends", count(last, "Stall suspected:") === ended, `${ended} -> ${count(last, "Stall suspected:")}`);
  const logs = await pluginLogs();
  c.check("no tick handler failure in the plugin log", !logs.includes("tick handler failed"), logs);
  c.note(`lastActivityAt is not shown by the CLI; ${field} stood in for it`);
  return c.done();
}

async function p3(): Promise<ProbeResult> {
  const c = new Checks();
  const o = await orchestrator("marker");
  await waitIdle(o);
  const ask = "Run the shell command: printenv MWP_ROLE . Then reply with exactly ROLE-IS:<the command output, empty if none>:END and nothing else.";
  const guarded = await newAgent({ title: "[Wave 1] 99 [mwp-smoke] guard", labels: { wave: "1", ticket: "99" }, parent: o, prompt: ask });
  const plain = await newAgent({ title: `${TAG} plain`, labels: { wave: "1", ticket: "99" }, parent: o, prompt: ask });
  const g = await until(() => logsOf(guarded), (t) => /ROLE-IS:[a-z]*:END/.test(t), 150);
  const p = await until(() => logsOf(plain), (t) => /ROLE-IS:[a-z]*:END/.test(t), 150);
  c.check("the ticket agent sees MWP_ROLE=ticket", /ROLE-IS:ticket:END/.test(g), g.slice(-200));
  c.check("the plain agent sees no MWP_ROLE", /ROLE-IS::END/.test(p), p.slice(-200));
  await waitIdle(guarded);
  const restart = await paseo(["restart", "--json"], { timeoutMs: 180_000 });
  let how = "paseo restart";
  let up = restart.code === 0 && (await paseo(["daemon", "status"], { timeoutMs: 40_000 })).stdout.includes("connectedDaemon: reachable");
  if (!up) {
    how = "paseo daemon stop, then start with the same environment (restart left the daemon unreachable)";
    await stopDaemon();
    await startDaemon(launchEnv, startMode);
    up = true;
  }
  c.note(`restarted by ${how}`);
  await paseo(["send", guarded, "Run the shell command: printenv MWP_ROLE . Then reply with exactly RESUMED-ROLE:<the command output, empty if none>:END and nothing else."], { timeoutMs: 300_000 });
  const after = await logsOf(guarded);
  c.check("the resumed ticket agent still prints ticket", /RESUMED-ROLE:ticket:END/.test(after), after.slice(-200));
  const logs = await pluginLogs();
  c.check("no agent.session_open could not read line for the resumed ticket agent", !logs.includes(`agent.session_open could not read the title or labels of agent ${guarded}`), logs);
  c.check("no agent.create handler failed line", !logs.includes("agent.create handler failed"));
  return c.done();
}

function git(cwd: string, args: string[]): string {
  const out = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  return (out.stdout ?? "").trim();
}

async function p9(): Promise<ProbeResult> {
  const c = new Checks();
  for (const repo of REPOS) {
    const name = repo.slice(repo.lastIndexOf("plugin-real-host-"));
    c.check(`${name}: git status --porcelain is empty`, git(repo, ["status", "--porcelain"]) === "", git(repo, ["status", "--porcelain"]));
    c.check(`${name}: HEAD unchanged`, git(repo, ["rev-parse", "HEAD"]) === heads.get(repo), git(repo, ["rev-parse", "HEAD"]));
  }
  const files = await stateFiles();
  c.check("MWP_STATE_DIR holds the plugin's files", files.includes("question-budget.json"), files.join(","));
  c.note(`state dir: ${files.join(",")}`);
  return c.done();
}

async function p12(): Promise<ProbeResult> {
  const c = new Checks();
  const env = childEnv({ CLAUDE_CONFIG_DIR: CLAUDE_CONFIG });
  const claude = async (args: string[]) => exec("claude", args, env, 180_000);
  const version = await claude(["--version"]);
  if (version.code !== 0) return c.done("the claude command is not on PATH");
  const marketplace = join(COPY, ".claude-plugin", "marketplace.json");
  const v1 = await claude(["plugin", "validate", COPY]);
  c.check("validate of the plugin passes", /Validation passed/.test(v1.stdout + v1.stderr), v1.stdout + v1.stderr);
  const v2 = await claude(["plugin", "validate", marketplace]);
  c.check("validate of the marketplace passes", /Validation passed/.test(v2.stdout + v2.stderr), v2.stdout + v2.stderr);
  const add = await claude(["plugin", "marketplace", "add", COPY]);
  c.check("marketplace add", add.code === 0, add.stdout + add.stderr);
  const install = await claude(["plugin", "install", "matt-with-paseo-plugin@matt-with-paseo-plugin"]);
  c.check("install", install.code === 0, install.stdout + install.stderr);
  const list = await claude(["plugin", "list"]);
  c.check("list shows it", list.stdout.includes("matt-with-paseo-plugin@matt-with-paseo-plugin"), list.stdout);
  const details = await claude(["plugin", "details", "matt-with-paseo-plugin"]);
  c.check("details lists the PreToolUse hook", details.stdout.includes("PreToolUse"), details.stdout);
  const remove = await claude(["plugin", "marketplace", "remove", "matt-with-paseo-plugin"]);
  c.check("marketplace remove", remove.code === 0, remove.stdout + remove.stderr);
  return c.done();
}

// ---------------------------------------------------------------- setup, clean-up, results

const heads = new Map<string, string>();

function setup(): void {
  mkdirSync(RUN, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(HOME, { recursive: true });
  const tar = join(RUN, "plugin-real-host-copy.tar");
  mkdirSync(COPY, { recursive: true });
  const archive = spawnSync("git", ["archive", "--format=tar", "-o", tar, "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr}`);
  const extract = spawnSync("tar", ["-xf", "plugin-real-host-copy.tar", "-C", "plugin-real-host-copy"], { cwd: RUN, encoding: "utf8" });
  if (extract.status !== 0) throw new Error(`tar failed: ${extract.stderr}`);
  copyFileSync(join(COPY, "test", "smoke", "conditions.json"), join(COPY, "server", "data", "conditions.json"));
  for (const [repo, file] of [[REPO_P5, "AGENTS-p5.md"], [REPO_SPEND, "AGENTS-spend.md"]] as const) {
    mkdirSync(repo, { recursive: true });
    copyFileSync(join(ROOT, "test", "smoke", "fixtures", file), join(repo, "AGENTS.md"));
    git(repo, ["init", "-q"]);
    git(repo, ["-c", "user.name=smoke", "-c", "user.email=smoke@example.invalid", "add", "AGENTS.md"]);
    git(repo, ["-c", "user.name=smoke", "-c", "user.email=smoke@example.invalid", "commit", "-q", "-m", "scratch"]);
    heads.set(repo, git(repo, ["rev-parse", "HEAD"]));
  }
}

async function configure(): Promise<void> {
  PORT = Number(process.env["MWP_SMOKE_PORT"] ?? (await freePort()));
  if (PORT === 6767 || PORT === 6790) throw new Error("refusing the owner's or the milestone's port");
  for (const [key, value] of [["pluginsEnabled", "true"], ["daemon.listen", `127.0.0.1:${PORT}`]]) {
    const out = await paseo(["daemon", "config", "set", key, value], { timeoutMs: 60_000 });
    if (out.code !== 0) throw new Error(`config set ${key} failed: ${out.stderr.slice(0, 200)}`);
  }
}

let cleaned = false;
let cleanupEvidence = "";

/** Synchronous, so it also runs from an exit or interrupt handler. */
function cleanup(): string {
  if (cleaned) return cleanupEvidence;
  cleaned = true;
  const notes: string[] = [];
  if (existsSync(HOME)) {
    const removed = paseoSync(["plugin", "remove", pluginId], 60_000);
    notes.push(`plugin remove exit ${removed.status}`);
    const stopped = paseoSync(["daemon", "stop"], 120_000);
    notes.push(`daemon stop: ${brief(stopped.stdout, 80)}`);
    const status = paseoSync(["daemon", "status"], 60_000);
    notes.push(`status: ${/localDaemon: (\w+)/.exec(status.stdout)?.[1] ?? "unknown"}`);
  }
  for (let attempt = 0; attempt < 8 && existsSync(RUN); attempt++) {
    try {
      rmSync(RUN, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
    } catch (error) {
      if (attempt === 7) notes.push(`delete failed: ${String(error).slice(0, 80)}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
    }
  }
  notes.push(`scratch folder ${existsSync(RUN) ? "still exists" : "deleted"}`);
  cleanupEvidence = notes.join("; ");
  return cleanupEvidence;
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
process.on("exit", () => void cleanup());

async function runProbe(id: string, body: () => Promise<ProbeResult>): Promise<void> {
  if (ONLY !== null && !ONLY.has(id)) return;
  log(`${id} start`);
  try {
    probeResults.set(id, await body());
  } catch (error) {
    probeResults.set(id, { status: "fail", evidence: `runner error: ${error instanceof Error ? error.message : String(error)}` });
  }
  const done = probeResults.get(id);
  log(`${id} ${done?.status}: ${brief(done?.evidence ?? "", 400)}`);
  if (process.env["MWP_SMOKE_DEBUG"] !== undefined) appendFileSync(join(BASE, "plugin-real-host-evidence.log"), `\n=== ${id} ${done?.status}\n${done?.evidence ?? ""}\n`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  setup();
  childEnv();
  log(`owner keys removed from every child environment (names only): ${removedNames.join(", ")}`);
  log(`scratch home ${HOME}`);
  await configure();
  log(`port ${PORT}; processors ${availableParallelism()}`);

  // Launch A: the gate cap, alone. `daemon start` first; if MWP_GATE_SHARE does not reach the plugin, `daemon run`.
  await startDaemon({ MWP_GATE_SHARE: "0.01" }, "start");
  await runProbe("P1", p1);
  if (ONLY !== null && !ONLY.has("P1")) await paseo(["plugin", "install", COPY, "--id", pluginId]);
  await runProbe("P8", p8);
  if (probeResults.get("P8")?.status === "fail" && ONLY === null) {
    log("P8 failed under daemon start; trying daemon run");
    await stopDaemon();
    await startDaemon({ MWP_GATE_SHARE: "0.01" }, "run");
    await runProbe("P8", p8);
    const again = probeResults.get("P8");
    if (again !== undefined) probeResults.set("P8", { ...again, evidence: `${again.evidence}; failed under daemon start, rerun under daemon run` });
  }
  await stopDaemon();

  // Launch B: everything else, one agent at a time except the sensor, which sleeps beside them.
  await startDaemon({ MWP_QUESTION_BUDGET: "2", MWP_STATE_DIR: STATE }, startMode);
  const sensor = ONLY === null || ONLY.has("P7") ? runProbe("P7", p7) : Promise.resolve();
  const plugin = runProbe("P12", p12);
  await runProbe("P10", p10);
  await runProbe("P2", p2);
  await runProbe("P4", p4);
  await runProbe("P5", p5);
  await runProbe("P6", p6);
  await runProbe("P11", p11);
  await Promise.all([sensor, plugin]);
  await runProbe("P3", p3);
  await runProbe("P9", p9);

  const cleanedBy = cleanup();
  log(`cleanup: ${cleanedBy}`);
  const date = new Date().toISOString().slice(0, 10);
  const paseoVersion = "0.10.1";
  const base = { date, paseo: paseoVersion, os: `${osType()} ${release()}`, node: process.version };
  const results: Result[] = SECTIONS.map((section) => {
    if (section.rest === "human") return { ...base, section: section.name, status: "human", evidence: "screenshots of the pill (first view, scrolled, narrow width): see the human list below" };
    if (section.rest === "runner") {
      const ok = /status: stopped/.test(cleanedBy) && /folder deleted/.test(cleanedBy);
      return { ...base, section: section.name, status: ok ? "pass" : "fail", evidence: cleanedBy };
    }
    const mine = section.probes.map((id) => ({ id, result: probeResults.get(id) }));
    const missing = mine.some((m) => m.result === undefined);
    const status: Status = missing ? "fail" : mine.some((m) => m.result?.status === "fail") ? "fail" : (mine.find((m) => m.result?.status.startsWith("blocked"))?.result?.status ?? (mine.some((m) => m.result?.status === "human") ? "human" : "pass"));
    return { ...base, section: section.name, status, evidence: mine.map((m) => `${m.id}: ${m.result?.evidence ?? "not run"}`).join(" // ") };
  });
  // An --only run rewrites only the lines of the sections whose every probe it ran.
  const ran = ONLY === null ? results : results.filter((r) => {
    const probes = SECTIONS.find((s) => s.name === r.section)?.probes ?? [];
    return probes.length > 0 && probes.every((id) => ONLY.has(id));
  });
  const readme = readFileSync(README, "utf8");
  writeFileSync(README, ONLY === null ? withResults(readme, results, HUMAN_STEPS) : withSectionResults(readme, ran));
  log(`done in ${Math.round((Date.now() - startedAt) / 60_000)} minutes; wrote ${ran.map((r) => r.section).join(", ") || "nothing"} in test/smoke/README.md`);
  for (const r of results) console.log(`${r.status.padEnd(8)} ${r.section}`);
  console.log("Only a person can do:");
  for (const step of HUMAN_STEPS) console.log(`- ${step}`);
  void PROBES;
}

main().catch((error) => {
  console.error(`[smoke] fatal: ${error instanceof Error ? error.stack : String(error)}`);
  log(`cleanup: ${cleanup()}`);
  process.exitCode = 1;
});
