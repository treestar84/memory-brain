import { test, expect } from "bun:test";
import { parse, stringify } from "yaml";

test("yaml parse/stringify roundtrip", () => {
  const obj = { id: "bugfix", version: "1.0.0", minConfidence: 0.6 };
  const raw = stringify(obj);
  expect(parse(raw)).toEqual(obj);
});

test("yaml parses multiline with arrays", () => {
  const raw = `id: bugfix\nrequiredBlockTypes:\n  - Action\n  - Outcome\n`;
  const parsed = parse(raw) as { id: string; requiredBlockTypes: string[] };
  expect(parsed.id).toBe("bugfix");
  expect(parsed.requiredBlockTypes).toEqual(["Action", "Outcome"]);
});
