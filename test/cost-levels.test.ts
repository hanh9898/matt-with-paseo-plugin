import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import {
  choiceFor,
  isCostLevels,
  LEVEL_ENV,
  levelOf,
  overlay,
  parseChoice,
  problemsOf,
  roleEnv,
  ROLES,
  type CostLevels,
} from "../shared/cost-levels.ts";
import * as costLevelsModule from "../server/cost-levels.ts";
import { loadCostLevels } from "../server/cost-levels.ts";

/** The shipped presets on disk, read here by the test: the plugin itself embeds them (`import.meta.url` is `undefined` in the daemon's bundle). */
const COST_LEVELS_FILE = fileURLToPath(new URL("../presets/cost-levels.json", import.meta.url));

const sample: CostLevels = {
  default: "balanced",
  levels: [
    {
      id: "cheap",
      says: "the least each role can do the work on",
      roles: {
        stream: { agent: "a", model: "small" },
        wave: { agent: "a", model: "small" },
        ticket: { agent: "a", model: "small" },
      },
    },
    {
      id: "balanced",
      says: "the middle",
      roles: {
        stream: { agent: "a", model: "mid" },
        wave: { agent: "a", model: "mid" },
        ticket: { agent: "a", model: "mid" },
      },
    },
  ],
};

function shipped(): unknown {
  return JSON.parse(readFileSync(COST_LEVELS_FILE, "utf8"));
}

test("the shipped presets pass the shape: three named levels, each setting every role", () => {
  assert.deepEqual(problemsOf(shipped()), []);
  const levels = loadCostLevels();
  assert.deepEqual(levels.levels.map((level) => level.id), ["cheap", "balanced", "max"]);
  for (const level of levels.levels) {
    assert.deepEqual(Object.keys(level.roles), [...ROLES], `${level.id} sets each role, in the roles' order`);
  }
  assert.equal(levels.default, "balanced");
});

test("the default presets are embedded in the module, equal the file, and no path to the file is exported (#52)", () => {
  assert.equal("COST_LEVELS_FILE" in costLevelsModule, false, "no exported path built from import.meta.url");
  assert.deepEqual(loadCostLevels(), shipped());
});

test("every agent a preset names is a harness descriptor, and no preset names a Paseo profile", () => {
  const ids = readdirSync(new URL("../harness/", import.meta.url))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
  const text = readFileSync(COST_LEVELS_FILE, "utf8");
  for (const level of loadCostLevels().levels) {
    for (const role of ROLES) {
      assert.ok(ids.includes(level.roles[role].agent), `${level.id}/${role} names an agent in harness/`);
    }
  }
  assert.doesNotMatch(text, /agent_profile_|"profile/, "the presets hold no profile id or profile name");
});

test("the shape refuses bad data by naming the field", () => {
  assert.notDeepEqual(problemsOf(null), []);
  assert.ok(problemsOf({ ...sample, default: "nope" }).some((line) => line.includes("default")));
  assert.ok(problemsOf({ ...sample, levels: [] }).some((line) => line.includes("levels")));
  const repeated = { ...sample, levels: [sample.levels[0], sample.levels[0]] };
  assert.ok(problemsOf(repeated).some((line) => line.includes("cheap")));
  const noTicket = {
    ...sample,
    levels: [{ ...sample.levels[0], roles: { stream: { agent: "a", model: "m" }, wave: { agent: "a", model: "m" } } }, sample.levels[1]],
  };
  assert.ok(problemsOf(noTicket).some((line) => line.includes("ticket")));
  const emptyModel = {
    ...sample,
    levels: [{ ...sample.levels[0], roles: { ...sample.levels[0]?.roles, ticket: { agent: "a", model: "" } } }, sample.levels[1]],
  };
  assert.ok(problemsOf(emptyModel).some((line) => line.includes("model")));
});

test("a setting reads as agent/model, and nothing else does", () => {
  assert.deepEqual(parseChoice("a/small"), { agent: "a", model: "small" });
  assert.deepEqual(parseChoice(" a/vendor/x-1 "), { agent: "a", model: "vendor/x-1" });
  for (const bad of ["", "a", "/m", "a/", "a b/m", "a/m n"]) assert.equal(parseChoice(bad), null, JSON.stringify(bad));
});

test("the setting names follow the role", () => {
  assert.equal(LEVEL_ENV, "MWP_COST_LEVEL");
  assert.equal(roleEnv("ticket"), "MWP_COST_TICKET");
  assert.equal(roleEnv("stream"), "MWP_COST_STREAM");
});

test("the level is the one named, or the default when none is named or the name is unknown", () => {
  assert.equal(levelOf(sample, {}).id, "balanced");
  assert.equal(levelOf(sample, { MWP_COST_LEVEL: "cheap" }).id, "cheap");
  assert.equal(levelOf(sample, { MWP_COST_LEVEL: " CHEAP " }).id, "cheap");
  assert.equal(levelOf(sample, { MWP_COST_LEVEL: "max" }).id, "balanced");
  assert.equal(levelOf(sample, { MWP_COST_LEVEL: "" }).id, "balanced");
});

test("a preset can be overridden per role: only the role named changes", () => {
  const env = { MWP_COST_LEVEL: "cheap", MWP_COST_TICKET: "b/big" };
  assert.deepEqual(choiceFor(sample, "ticket", env), { choice: { agent: "b", model: "big" }, from: "override" });
  assert.deepEqual(choiceFor(sample, "wave", env), { choice: { agent: "a", model: "small" }, from: "level" });
  assert.deepEqual(choiceFor(sample, "stream", {}), { choice: { agent: "a", model: "mid" }, from: "level" });
});

test("an override that is not agent/model falls back to the level (T4)", () => {
  assert.deepEqual(choiceFor(sample, "ticket", { MWP_COST_TICKET: "big" }), {
    choice: { agent: "a", model: "mid" },
    from: "level",
  });
});

test("a profile is laid under a choice without being changed", () => {
  const profile = Object.freeze({ id: "p1", name: "ticket-agent", provider: "x", model: "old", modeId: "auto", thinkingOptionId: "medium" });
  const launch = overlay({ agent: "a", model: "small" }, profile);
  assert.deepEqual(launch, { id: "p1", name: "ticket-agent", provider: "a", model: "small", modeId: "auto", thinkingOptionId: "medium" });
  assert.equal(profile.model, "old");
  assert.notEqual(launch, profile);
});

test("the loader reads a file, and refuses one that is not JSON or breaks the shape, naming it", () => {
  const dir = mkdtempSync(join(tmpdir(), "mwp-cost-levels-"));
  try {
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify(sample));
    assert.deepEqual(loadCostLevels(good), sample);
    const notJson = join(dir, "not-json.json");
    writeFileSync(notJson, "{");
    assert.throws(() => loadCostLevels(notJson), /not-json\.json/);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ default: "x", levels: [] }));
    assert.throws(() => loadCostLevels(bad), /bad\.json.*default/s);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no module of the plugin creates, edits or deletes a Paseo profile", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const modules = readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((path) => path.split("\\").join("/"))
    .filter((path) => /\.tsx?$/.test(path) && !path.startsWith("test/") && !path.includes("node_modules"));
  assert.ok(modules.length > 0);
  for (const path of modules) {
    const text = readFileSync(join(root, path), "utf8");
    assert.doesNotMatch(text, /\b(create|update|delete|save|write)Profiles?\b|\bprofiles\.(create|update|delete|save)\b/, `${path} touches a profile`);
  }
});
