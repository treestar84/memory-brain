import { describe, test, expect } from "bun:test";
import { FRONTMATTER_RE, stripBom, normalizeYamlBlock } from "../../../src/core/util/frontmatter";

describe("FRONTMATTER_RE", () => {
  test("LF (기존 동작) 매치", () => {
    const text = "---\nid: x\ntype: concept\n---\n\nbody\n";
    const m = FRONTMATTER_RE.exec(text);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("id: x\ntype: concept");
    expect(m![2]).toBe("\nbody\n");
  });

  test("CRLF 파일 — 매치 성공 (CRLF 미대응 버그 회귀)", () => {
    const text = "---\r\nid: x\r\ntype: concept\r\n---\r\n\r\nbody\r\n";
    const m = FRONTMATTER_RE.exec(text);
    expect(m).not.toBeNull();
  });

  test("닫는 --- 뒤 본문 없음(trailing newline 없음) 도 매치", () => {
    const text = "---\nid: x\n---";
    const m = FRONTMATTER_RE.exec(text);
    expect(m).not.toBeNull();
    expect(m![2]).toBe("");
  });
});

describe("stripBom", () => {
  test("선두 BOM 제거", () => {
    expect(stripBom("﻿---\nid: x\n---\n")).toBe("---\nid: x\n---\n");
  });

  test("BOM 없으면 그대로", () => {
    expect(stripBom("---\nid: x\n---\n")).toBe("---\nid: x\n---\n");
  });
});

describe("normalizeYamlBlock", () => {
  test("CRLF → LF, 잔존 \\r 제거", () => {
    expect(normalizeYamlBlock("id: x\r\ntype: concept\r\n")).toBe("id: x\ntype: concept\n");
  });
});
