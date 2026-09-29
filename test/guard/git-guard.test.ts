import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ROLE_ENV, TICKET_ROLE } from "../../shared/role-marker.ts";

const script = fileURLToPath(new URL("../../guard/git-guard.mjs", import.meta.url));

/** Runs the guard the way the agent's hook runner does: the tool call as JSON on stdin, the agent's environment around it. */
function run(stdin: string, role: string | null) {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env[ROLE_ENV];
  if (role !== null) env[ROLE_ENV] = role;
  const done = spawnSync(process.execPath, [script], { input: stdin, env, encoding: "utf8" });
  return { status: done.status, stderr: done.stderr, stdout: done.stdout };
}

function bash(command: string, role: string | null = TICKET_ROLE) {
  return run(JSON.stringify({ tool_name: "Bash", tool_input: { command } }), role);
}

const refused = [
  "git push",
  "git push origin HEAD",
  "git push --force-with-lease -u origin stream/x",
  "git checkout main",
  "git checkout -b other",
  "git checkout .",
  "git checkout -- file.ts",
  "git switch main",
  "git rebase main",
  "git merge feature",
  "git pull",
  "git reset --hard",
  "git reset --hard HEAD~1",
  "git clean -fd",
  "git clean -f",
  "git clean --force",
  "git branch -D other",
  "git branch -d other",
  "git branch --delete other",
  "git restore .",
  "git restore -- .",
  // the git a person would type around the subcommand
  "git -C ../elsewhere push",
  "git -c user.name=x push",
  "git --git-dir=/tmp/x/.git push",
  "git --no-pager checkout main",
  "GIT_SSH_COMMAND=ssh git push",
  "FOO=1 BAR=2 git push",
  "cd sub && git push",
  "git add . && git commit -m x && git push",
  "git status; git checkout main",
  "git status || git push",
  "git log | cat & git push",
  "echo done\ngit push",
  "(git push)",
  "{ git push; }",
  "if true; then git push; fi",
  "sudo git push",
  "env FOO=1 git push",
  "command git push",
  "time git push",
  "/usr/bin/git push",
  "git.exe push",
  "GIT push",
  "C:\\Git\\cmd\\git.exe push",
  '"C:\\Program Files\\Git\\cmd\\git.exe" push',
  "'git' push",
  // the same command inside another shell or a substitution
  'bash -c "git push"',
  "sh -c 'git checkout main'",
  'bash -lc "cd x && git push"',
  'eval "git push"',
  "eval git push",
  'powershell -Command "git push"',
  'pwsh -c "git push"',
  'cmd /c "git push"',
  "echo $(git push)",
  'echo "$(git push)"',
  "echo `git push`",
  "& git push",
  "xargs git push",
];

const allowed = [
  "git status",
  "git add -A",
  "git add .",
  "git commit -m 'feat(x): add y'",
  'git commit -m "docs: explain why git push is refused"',
  "git commit -m 'note: git checkout main is refused' -m 'and so is git merge'",
  "git commit --amend --no-edit",
  "git diff",
  "git diff main...HEAD",
  "git log --oneline -5",
  "git show HEAD",
  "git branch",
  "git branch --show-current",
  "git branch --list",
  "git branch -a",
  "git branch -vv",
  "git branch new-name",
  "git fetch origin",
  "git stash list",
  "git restore file.ts",
  "git restore --staged file.ts",
  "git reset HEAD file.ts",
  "git reset --soft HEAD~1",
  "git clean -n",
  "git clean --dry-run",
  "git rev-parse --abbrev-ref HEAD",
  "git -C sub status",
  "git -c core.pager=cat log",
  "git config user.name",
  "npm test",
  "ls -la",
  "echo git push",
  "echo 'git push' > note.txt",
  "grep -rn 'git checkout' docs",
  "cat guard/git-guard.mjs",
  "gh issue comment 2 --body-file body.md",
  "gh pr create --title 'x'",
  "mygit push",
  "gitk",
  "digit push",
  "",
];

test("a ticket agent's push, checkout and other branch-moving git is refused, exit 2", () => {
  for (const command of refused) {
    const result = bash(command);
    assert.equal(result.status, 2, `${JSON.stringify(command)} should be refused, got ${result.status}`);
  }
});

test("a ticket agent can still commit on its own branch, read history and run everything else", () => {
  for (const command of allowed) {
    const result = bash(command);
    assert.equal(result.status, 0, `${JSON.stringify(command)} should pass, got ${result.status}: ${result.stderr}`);
    assert.equal(result.stderr, "", `${JSON.stringify(command)} should say nothing`);
  }
});

test("the same commands pass with no marker: the orchestrator can push and clean up", () => {
  for (const command of refused) {
    const result = bash(command, null);
    assert.equal(result.status, 0, `${JSON.stringify(command)} should pass without the marker`);
    assert.equal(result.stderr, "");
  }
});

test("only the ticket role is guarded: another value of the marker passes", () => {
  for (const role of ["", "orchestrator", "Ticket", "ticket ", "1"]) {
    assert.equal(bash("git push", role).status, 0, `role ${JSON.stringify(role)} should pass`);
  }
});

test("the refusal names what was refused, and says what a ticket agent does instead", () => {
  const push = bash("git push origin HEAD").stderr;
  assert.match(push, /git push/);
  assert.match(push, /orchestrator/);
  assert.match(push, /commit/);
  const checkout = bash("cd x && git checkout main").stderr;
  assert.match(checkout, /git checkout/);
  assert.match(checkout, /orchestrator/);
  const reset = bash("git reset --hard HEAD~1").stderr;
  assert.match(reset, /git reset --hard/);
  const clean = bash("git clean -fd").stderr;
  assert.match(clean, /git clean -f/);
  const branch = bash("git branch -D other").stderr;
  assert.match(branch, /git branch -D/);
  assert.equal(bash("git push").stdout, "");
});

test("the refusal is one short message that holds no part of the command's arguments", () => {
  const message = bash("git push https://user:secret-token@example.com/repo.git").stderr;
  assert.doesNotMatch(message, /secret-token|example\.com/);
  assert.ok(message.trim().split("\n").length <= 3, message);
});

test("every command of a chain is judged, so a refused one hides nowhere", () => {
  assert.equal(bash("git add . && git commit -m ok").status, 0);
  assert.equal(bash("git add . && git commit -m ok && git push").status, 2);
  assert.equal(bash("git commit -m 'git push' && git push").status, 2);
});

test("a tool call that is not a shell command passes", () => {
  const edit = run(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "a.ts", new_string: "git push" } }), TICKET_ROLE);
  assert.equal(edit.status, 0);
  const write = run(JSON.stringify({ tool_name: "Write", tool_input: { file_path: "a.sh", content: "git push" } }), TICKET_ROLE);
  assert.equal(write.status, 0);
});

test("the PowerShell tool is guarded the same way", () => {
  const call = (command: string) => run(JSON.stringify({ tool_name: "PowerShell", tool_input: { command } }), TICKET_ROLE);
  assert.equal(call("git push origin HEAD").status, 2);
  assert.equal(call("git add .; git checkout main").status, 2);
  assert.equal(call("& git push").status, 2);
  assert.equal(call("git commit -m 'x'").status, 0);
});

test("the guard fails open: input it cannot read never blocks the agent (T4)", () => {
  for (const stdin of ["", "not json", "null", "[]", "42", '"git push"', "{}", '{"tool_name":"Bash"}', '{"tool_name":"Bash","tool_input":null}', '{"tool_name":"Bash","tool_input":{"command":7}}', '{"tool_name":"Bash","tool_input":{"command":["git","push"]}}']) {
    const result = run(stdin, TICKET_ROLE);
    assert.equal(result.status, 0, `${JSON.stringify(stdin)} should pass, got ${result.status}: ${result.stderr}`);
  }
});

test("a quote left open or a very long command does not hang or crash the guard", () => {
  assert.equal(bash("git commit -m 'unterminated").status, 0);
  assert.equal(bash("git push 'unterminated").status, 2);
  assert.equal(bash(`echo ${"a ".repeat(50_000)}`).status, 0);
  assert.equal(bash(`${"echo x; ".repeat(5_000)}git push`).status, 2);
});

test("the guard reads no file and runs no program: it decides from the tool call and the marker alone", () => {
  const env: Record<string, string | undefined> = { ...process.env, [ROLE_ENV]: TICKET_ROLE };
  for (const name of Object.keys(env)) if (name.toLowerCase() === "path") delete env[name];
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push" } }),
    env: { ...env, PATH: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
});
