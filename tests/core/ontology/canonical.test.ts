import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCanonicalActions,
  resolveActionRef,
  flattenCanonicalActions,
  defaultCanonicalActionsPath,
} from "../../../src/core/ontology/canonical";
import { validateSSL, SSL_VERSION, type SSLDocument } from "../../../src/core/ontology/ssl";

function makeDoc(overrides: Partial<SSLDocument> = {}): SSLDocument {
  return {
    sslVersion: SSL_VERSION,
    sourceSkillPath: "/skills/x.md",
    sourceSha256: "x",
    generatedAt: "2026-05-05T00:00:00Z",
    generatedBy: "llm",
    scheduling: {
      id: "x#scheduling",
      skillName: "x",
      skillGoal: "",
      intentSignature: "",
      intentSignatures: [],
      triggerPatterns: [],
      expectedInputs: [],
      expectedOutputs: [],
      dependencies: [],
      controlFlowFeatures: [],
      ioContract: { inputsRaw: "", outputsRaw: "" },
      preconditions: [],
    },
    structural: [],
    logical: [],
    warnings: [],
    ...overrides,
  };
}

describe("Canonical Action Store (PR-V3.17a)", () => {
  let memoryDir: string;

  beforeEach(async () => {
    memoryDir = await mkdtemp(join(tmpdir(), "canonical-"));
    await mkdir(join(memoryDir, "concepts/_ssl/_canonical"), { recursive: true });
  });

  afterEach(async () => {
    await rm(memoryDir, { recursive: true, force: true });
  });

  test("loader: 파일 없으면 빈 store (graceful)", async () => {
    const store = await loadCanonicalActions(defaultCanonicalActionsPath(memoryDir));
    expect(store.items).toEqual({});
    expect(store.extensions).toEqual({});
  });

  test("loader: yaml 파싱 + items 추출", async () => {
    await writeFile(
      defaultCanonicalActionsPath(memoryDir),
      `storeVersion: "1.0.0"
items:
  READ_LOCAL_FILE:
    action: READ
    resources: [LOCAL_FS]
    description: "Read a file from local filesystem."
extensions: {}
`,
    );
    const store = await loadCanonicalActions(defaultCanonicalActionsPath(memoryDir));
    expect(store.storeVersion).toBe("1.0.0");
    expect(store.items.READ_LOCAL_FILE.action).toBe("READ");
    expect(store.items.READ_LOCAL_FILE.resources).toEqual(["LOCAL_FS"]);
  });

  test("resolve: items + extensions 합집합 lookup", async () => {
    await writeFile(
      defaultCanonicalActionsPath(memoryDir),
      `storeVersion: "1.0.0"
items:
  READ_LOCAL_FILE:
    action: READ
    resources: [LOCAL_FS]
    description: "core"
extensions:
  CUSTOM_FETCH:
    action: CALL_TOOL
    resources: [NETWORK]
    description: "user extension"
`,
    );
    const store = await loadCanonicalActions(defaultCanonicalActionsPath(memoryDir));
    expect(resolveActionRef("READ_LOCAL_FILE", store)?.action).toBe("READ");
    expect(resolveActionRef("CUSTOM_FETCH", store)?.action).toBe("CALL_TOOL");
    expect(resolveActionRef("NOT_THERE", store)).toBeNull();
  });

  test("resolve: extensions 가 같은 키 override (사용자 우선)", async () => {
    await writeFile(
      defaultCanonicalActionsPath(memoryDir),
      `items:
  READ_LOCAL_FILE: { action: READ, resources: [LOCAL_FS], description: core }
extensions:
  READ_LOCAL_FILE: { action: READ, resources: [LOCAL_FS, MEMORY], description: override }
`,
    );
    const store = await loadCanonicalActions(defaultCanonicalActionsPath(memoryDir));
    const flat = flattenCanonicalActions(store);
    expect(flat.READ_LOCAL_FILE.resources).toEqual(["LOCAL_FS", "MEMORY"]);
    expect(flat.READ_LOCAL_FILE.description).toBe("override");
  });

  test("loader: invalid id 거부 (UPPER_SNAKE 만 허용)", async () => {
    await writeFile(
      defaultCanonicalActionsPath(memoryDir),
      `items:
  read_local_file: { action: READ, resources: [LOCAL_FS], description: x }
`,
    );
    await expect(loadCanonicalActions(defaultCanonicalActionsPath(memoryDir))).rejects.toThrow(/invalid id/);
  });

  test("loader: 필수 필드 누락 거부", async () => {
    await writeFile(
      defaultCanonicalActionsPath(memoryDir),
      `items:
  BAD: { action: READ, description: x }
`,
    );
    await expect(loadCanonicalActions(defaultCanonicalActionsPath(memoryDir))).rejects.toThrow(/resources/);
  });

  test("validateSSL: actionRef 일치 시 통과", async () => {
    await writeFile(
      defaultCanonicalActionsPath(memoryDir),
      `items:
  READ_LOCAL_FILE: { action: READ, resources: [LOCAL_FS], description: x }
`,
    );
    const store = await loadCanonicalActions(defaultCanonicalActionsPath(memoryDir));
    const doc = makeDoc({
      logical: [{
        id: "x#l:1", action: "READ", description: "load config",
        resources: ["LOCAL_FS"], actionRef: "READ_LOCAL_FILE",
        effects: [], evidenceClaimIds: [],
      }],
    });
    const errors = validateSSL(doc, { canonicalActions: { resolve: (r) => store.items[r] ?? null } });
    expect(errors).toEqual([]);
  });

  test("validateSSL: actionRef 와 inline action 불일치 시 에러", async () => {
    const lookup = { resolve: (r: string) => r === "READ_LOCAL_FILE" ? { action: "READ" as const, resources: ["LOCAL_FS" as const] } : null };
    const doc = makeDoc({
      logical: [{
        id: "x#l:1", action: "WRITE", description: "wrong",
        resources: ["LOCAL_FS"], actionRef: "READ_LOCAL_FILE",
        effects: [], evidenceClaimIds: [],
      }],
    });
    const errors = validateSSL(doc, { canonicalActions: lookup });
    expect(errors.some((e) => /actionRef/.test(e) && /WRITE/.test(e))).toBe(true);
  });

  test("validateSSL: actionRef resources mismatch 에러", async () => {
    const lookup = { resolve: (r: string) => r === "READ_LOCAL_FILE" ? { action: "READ" as const, resources: ["LOCAL_FS" as const] } : null };
    const doc = makeDoc({
      logical: [{
        id: "x#l:1", action: "READ", description: "with extra resource",
        resources: ["LOCAL_FS", "NETWORK"], actionRef: "READ_LOCAL_FILE",
        effects: [], evidenceClaimIds: [],
      }],
    });
    const errors = validateSSL(doc, { canonicalActions: lookup });
    expect(errors.some((e) => /resources mismatch/.test(e))).toBe(true);
  });

  test("validateSSL: actionRef 가 store 에 없으면 에러", () => {
    const lookup = { resolve: (_r: string) => null };
    const doc = makeDoc({
      logical: [{
        id: "x#l:1", action: "READ", description: "x",
        resources: ["LOCAL_FS"], actionRef: "GHOST_ACTION",
        effects: [], evidenceClaimIds: [],
      }],
    });
    const errors = validateSSL(doc, { canonicalActions: lookup });
    expect(errors.some((e) => /not found in canonical store/.test(e))).toBe(true);
  });

  test("validateSSL: actionRef 있고 store 미주입 → schema 통과 (back-compat)", () => {
    const doc = makeDoc({
      logical: [{
        id: "x#l:1", action: "READ", description: "x",
        resources: ["LOCAL_FS"], actionRef: "READ_LOCAL_FILE",
        effects: [], evidenceClaimIds: [],
      }],
    });
    const errors = validateSSL(doc); // no opts
    expect(errors).toEqual([]);
  });

  test("validateSSL: actionRef 없는 logical 은 영향 없음", () => {
    const doc = makeDoc({
      logical: [{
        id: "x#l:1", action: "READ", description: "x",
        resources: ["LOCAL_FS"],
        effects: [], evidenceClaimIds: [],
      }],
    });
    const errors = validateSSL(doc, { canonicalActions: { resolve: () => null } });
    expect(errors).toEqual([]);
  });

  test("실제 시드 yaml 7 항목 로드 + 모두 valid action/resources", async () => {
    const repoRoot = process.env.CFGM_PROJECT_ROOT ?? process.cwd();
    const realPath = defaultCanonicalActionsPath(join(repoRoot, "memory"));
    const store = await loadCanonicalActions(realPath);
    const ids = Object.keys(store.items);
    expect(ids).toContain("INFER_FROM_MEMORY");
    expect(ids).toContain("READ_LOCAL_FILE");
    expect(ids).toContain("CALL_LOCAL_SCRIPT");
    expect(ids.length).toBeGreaterThanOrEqual(7);
  });
});
