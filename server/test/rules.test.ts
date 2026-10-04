import assert from "node:assert/strict";
import { test } from "node:test";
import { allocate, DEFAULT_RULES, weight } from "../../shared/rules.ts";

const R = DEFAULT_RULES;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("everyone who DCAs is paid, and the whole pool goes out", () => {
  const w = Array.from({ length: 40 }, (_, i) => weight(1 + (i % 7), 0.1 + i * 0.05, R));
  const a = allocate(w, 10, R);
  assert.equal(a.filter((x) => x > 0).length, 40);
  assert.ok(near(sum(a), 10));
  // the equal half guarantees every DCAer at least half an equal slice
  for (const x of a) assert.ok(x >= (10 * R.equalShare) / 40 - 1e-9);
});

test("consistency still earns more", () => {
  const a = allocate([weight(10, 1, R), weight(1, 1, R), weight(1, 1, R), weight(1, 1, R), weight(1, 1, R)], 1, R);
  assert.ok(a[0] > a[1]);
  assert.ok(near(a[1], a[2]));
});

test("no whale takes more than the cap", () => {
  const w = [weight(50, 100, R), ...Array.from({ length: 9 }, () => weight(1, 0.1, R))];
  const a = allocate(w, 1, R);
  assert.ok(a[0] <= R.maxShare + 1e-9, `whale got ${a[0]}`);
  assert.ok(near(sum(a), 1), "what the cap trims goes to the others");
});

test("few qualifiers still split the whole pool", () => {
  const a = allocate([weight(9, 5, R), weight(1, 0.1, R)], 1, R);
  assert.ok(near(sum(a), 1));
  assert.ok(near(a[0], 0.5) && near(a[1], 0.5), "with two, the cap relaxes to 1/2 each");
  assert.ok(near(allocate([weight(3, 1, R)], 2, R)[0], 2), "a lone DCAer gets it all");
});

test("an operator top N still limits who is paid", () => {
  const a = allocate([3, 2, 1, 0.5], 1, { ...R, topN: 2 });
  assert.equal(a.filter((x) => x > 0).length, 2);
  assert.equal(a[2], 0);
});
