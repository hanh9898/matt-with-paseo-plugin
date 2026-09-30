import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { cardLines } from "../client/report-card-text.ts";
import { CARD_RENDERER, contributeReportCard } from "../client/report-card.ts";
import { reportCardRow } from "../server/report-card.ts";
import { REPORT_CARD } from "../shared/contract.ts";

function read(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

const entry = { stream: "demo", agent: "tkt-7", header: "Colour", answer: "Red (Recommended)", at: "2026-09-30T10:00:00.000Z" };

/** A client that records what `addTimelineRenderer` is given. */
function fakeClient() {
  const renderers: { kind: string; version: number; schema: { safeParse(value: unknown): { success: boolean } }; Component: unknown }[] = [];
  return { renderers, client: { addTimelineRenderer: (renderer: (typeof renderers)[number]) => void renderers.push(renderer) } };
}
const View = () => null;

test("the client registers one renderer for the card's kind and version, so Paseo draws the row instead of a placeholder", () => {
  const { renderers, client } = fakeClient();
  contributeReportCard(client, View);
  assert.equal(renderers.length, 1);
  assert.equal(renderers[0]?.kind, REPORT_CARD.kind);
  assert.equal(renderers[0]?.version, REPORT_CARD.version);
  assert.equal(renderers[0]?.Component, View);
  assert.equal(CARD_RENDERER.kind, REPORT_CARD.kind);
});

test("the renderer's schema accepts the row the daemon builds, and rejects a row missing a part of it", () => {
  const { renderers, client } = fakeClient();
  contributeReportCard(client, View);
  const schema = renderers[0]?.schema;
  assert.ok(schema);
  for (const input of [
    { decided: [entry], spend: { totalUsd: 1, appetiteUsd: 5, partial: true, notified: false }, questions: { count: 2, budget: 5 } },
    { decided: [], spend: undefined, questions: { count: 0, budget: null } },
  ]) {
    assert.equal(schema.safeParse(reportCardRow(input).data).success, true);
  }
  const data = reportCardRow({ decided: [], spend: undefined, questions: { count: 0, budget: null } }).data as Record<string, unknown>;
  for (const field of REPORT_CARD.fields) {
    const { [field]: _dropped, ...rest } = data;
    assert.equal(schema.safeParse(rest).success, false, `a card without ${field} is rejected`);
  }
});

test("the card's lines list each decision, the spend against the appetite, and the question count against the budget", () => {
  const lines = cardLines(reportCardRow({ decided: [entry], spend: { totalUsd: 1.5, appetiteUsd: 5, partial: false, notified: false }, questions: { count: 2, budget: 5 } }).data as never);
  assert.equal(lines.title, "Report card");
  assert.deepEqual(lines.decided, ["Colour: Red (Recommended)"]);
  assert.equal(lines.spend, "Spend $1.50 of $5.00");
  assert.equal(lines.questions, "Questions today: 2 of 5");
});

test("the card says when the total is partial, when there is no appetite or budget, and when nothing was decided", () => {
  const lines = cardLines(reportCardRow({ decided: [], spend: { totalUsd: 0.5, appetiteUsd: null, partial: true, notified: false }, questions: { count: 3, budget: null } }).data as never);
  assert.match(lines.spend, /partial/);
  assert.match(lines.spend, /no limit set/);
  assert.match(lines.questions, /no limit set/);
  assert.deepEqual(lines.decided, []);
  assert.match(lines.none, /Nothing decided/);
});

test("the card's client files hold nothing a person can press", () => {
  for (const name of ["client/report-card.ts", "client/report-card-text.ts", "client/report-card-view.ts"]) {
    assert.doesNotMatch(read(name), /Pressable|onPress|TouchableOpacity|Button|onClick/, `${name} has no button`);
  }
});

test("the view takes its colours from the theme, and the client entry registers the card beside the pill", () => {
  assert.match(read("client/report-card-view.ts"), /theme\.colors\.foreground/);
  const client = read("index.client.ts");
  assert.match(client, /contributeReportCard\(client, ReportCardView\)/);
  assert.match(client, /return contributeWaitingPill\(client\)/);
});
