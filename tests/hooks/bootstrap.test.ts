import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveRepoRoot, resolveStorageRoot, resolveProjectRoot } from "../../src/hooks/bootstrap";

/**
 * resolveRepoRoot 는 V3.42 실사용 시뮬레이션에서 실제로 재현된 사고(사용자
 * 기억이 CFGM_PROJECT_ROOT 미지정 시 memory-brain 툴 저장소 자체에 섞여
 * 들어가고, 그 저장소를 정리하면 조용히 영구 소실됨)를 막기 위한 안전장치다.
 * dogfooding(툴 저장소 자체에서 명령 실행)은 정상 사용법이라 차단하지 않고,
 * "의도치 않게 그 상태"일 수 있음을 stderr 경고로만 알린다.
 */
describe("resolveRepoRoot", () => {
  const originalCwd = process.cwd();
  const originalProjectRoot = process.env.CFGM_PROJECT_ROOT;
  const originalProject = process.env.CFGM_PROJECT;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalProjectRoot === undefined) delete process.env.CFGM_PROJECT_ROOT;
    else process.env.CFGM_PROJECT_ROOT = originalProjectRoot;
    if (originalProject === undefined) delete process.env.CFGM_PROJECT;
    else process.env.CFGM_PROJECT = originalProject;
  });

  beforeEach(() => {
    delete process.env.CFGM_PROJECT_ROOT;
    delete process.env.CFGM_PROJECT;
  });

  test("CFGM_PROJECT_ROOT 지정 시 그대로 사용, 경고 없음", () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    process.env.CFGM_PROJECT_ROOT = "/tmp/some-project";
    expect(resolveRepoRoot()).toBe(resolve("/tmp/some-project"));
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test("CFGM_PROJECT_ROOT 가 CFGM_PROJECT 보다 우선 (기존 23개 bin 스크립트의 원래 우선순위 유지)", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/root-project";
    process.env.CFGM_PROJECT = "/tmp/project-project";
    expect(resolveRepoRoot()).toBe(resolve("/tmp/root-project"));
  });

  test("env 미지정 + cwd 에 package.json 없음 → cwd 그대로, 경고 없음", async () => {
    const dir = await mkdtemp(join(tmpdir(), "resolve-repo-root-"));
    try {
      const errSpy = spyOn(console, "error").mockImplementation(() => {});
      process.chdir(dir);
      expect(resolveRepoRoot()).toBe(process.cwd());
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("env 미지정 + cwd 가 무관한 package.json 을 가진 프로젝트 → 경고 없음", async () => {
    const dir = await mkdtemp(join(tmpdir(), "resolve-repo-root-"));
    try {
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "my-splitpot-app" }));
      const errSpy = spyOn(console, "error").mockImplementation(() => {});
      process.chdir(dir);
      expect(resolveRepoRoot()).toBe(process.cwd());
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("env 미지정 + cwd 가 memory-brain 툴 저장소(package name: cfgm-os) → stderr 경고, 값은 그대로 반환(차단 아님), 같은 프로세스 내 재호출은 조용함", async () => {
    const dir = await mkdtemp(join(tmpdir(), "resolve-repo-root-tool-"));
    try {
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "cfgm-os" }));
      const errSpy = spyOn(console, "error").mockImplementation(() => {});
      process.chdir(dir);

      const first = resolveRepoRoot();
      expect(first).toBe(process.cwd()); // 차단하지 않음 — dogfooding 은 정상 사용법
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy.mock.calls[0]![0]).toContain("CFGM_PROJECT_ROOT");

      const second = resolveRepoRoot();
      expect(second).toBe(process.cwd());
      expect(errSpy).toHaveBeenCalledTimes(1); // 반복 호출에 재경고 없음(노이즈 방지)

      errSpy.mockRestore();
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * resolveStorageRoot 는 검색 인덱스(sqlite)가 저장되는 경로를 결정한다. 실효성
 * 검증 시뮬레이션 round 2에서 재현된 사고: env var 미지정 시 이 함수만 고정된
 * 홈 디렉터리 경로로 폴백해 프로젝트 간에 인덱스가 전역 공유되고, 한 프로젝트에서
 * rebuild-index 를 돌리면 다른 프로젝트(또는 memory-brain 툴 저장소 자신)의 검색
 * 결과가 조용히 사라졌다. resolveRepoRoot 와 동일하게 cwd 기준으로 프로젝트별
 * 분리를 보장해야 한다.
 */
describe("resolveStorageRoot", () => {
  const originalCwd = process.cwd();
  const originalProjectRoot = process.env.CFGM_PROJECT_ROOT;
  const originalProject = process.env.CFGM_PROJECT;
  const originalHome = process.env.CFGM_HOME;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalProjectRoot === undefined) delete process.env.CFGM_PROJECT_ROOT;
    else process.env.CFGM_PROJECT_ROOT = originalProjectRoot;
    if (originalProject === undefined) delete process.env.CFGM_PROJECT;
    else process.env.CFGM_PROJECT = originalProject;
    if (originalHome === undefined) delete process.env.CFGM_HOME;
    else process.env.CFGM_HOME = originalHome;
  });

  beforeEach(() => {
    delete process.env.CFGM_PROJECT_ROOT;
    delete process.env.CFGM_PROJECT;
    delete process.env.CFGM_HOME;
  });

  test("CFGM_HOME 지정 시 그대로 사용 (명시적 전역 공유 override)", () => {
    process.env.CFGM_HOME = "/tmp/shared-brain-home";
    expect(resolveStorageRoot()).toBe("/tmp/shared-brain-home");
  });

  test("CFGM_PROJECT_ROOT 지정 시 <root>/.memory-brain 사용", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/project-a";
    expect(resolveStorageRoot()).toBe(resolve("/tmp/project-a", ".memory-brain"));
  });

  test("env 전부 미지정 → cwd/.memory-brain (프로젝트별 분리, 고정 홈 경로 아님)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "resolve-storage-root-"));
    try {
      process.chdir(dir);
      expect(resolveStorageRoot()).toBe(resolve(process.cwd(), ".memory-brain"));
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("서로 다른 두 프로젝트(cwd)에서 env 미지정이면 storageRoot 가 서로 달라야 한다 (전역 공유 회귀 방지)", async () => {
    const dirA = await mkdtemp(join(tmpdir(), "resolve-storage-root-a-"));
    const dirB = await mkdtemp(join(tmpdir(), "resolve-storage-root-b-"));
    try {
      process.chdir(dirA);
      const rootA = resolveStorageRoot();
      const cwdA = process.cwd();
      process.chdir(dirB);
      const rootB = resolveStorageRoot();
      const cwdB = process.cwd();

      expect(rootA).not.toBe(rootB);
      expect(rootA).toBe(resolve(cwdA, ".memory-brain"));
      expect(rootB).toBe(resolve(cwdB, ".memory-brain"));
    } finally {
      process.chdir(originalCwd);
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });

  test("resolveProjectRoot 는 env 미지정 시 storageRoot 의 부모(cwd)를 가리킨다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "resolve-project-root-"));
    try {
      process.chdir(dir);
      expect(resolveProjectRoot()).toBe(process.cwd());
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * argv `--project-root` 지원 (V3.44, Windows 지원) — 훅 command 가 더 이상
 * `/usr/bin/env CFGM_PROJECT_ROOT=<path> bun run <script>` (POSIX 전용) 형태가
 * 아니라 `bun run <script> --project-root <path>` 로 값을 넘기므로, 우선순위를
 * 명시적으로 고정한다: argv > CFGM_HOME > CFGM_PROJECT > CFGM_PROJECT_ROOT > cwd.
 * 기존 env-접두사 방식으로 이미 설치된 훅(argv 없음)은 이 우선순위 변경으로
 * 동작이 전혀 바뀌지 않아야 한다(하위호환) — 그 케이스도 별도로 고정한다.
 */
describe("argv --project-root 우선순위", () => {
  const originalCwd = process.cwd();
  const originalProjectRoot = process.env.CFGM_PROJECT_ROOT;
  const originalProject = process.env.CFGM_PROJECT;
  const originalHome = process.env.CFGM_HOME;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalProjectRoot === undefined) delete process.env.CFGM_PROJECT_ROOT;
    else process.env.CFGM_PROJECT_ROOT = originalProjectRoot;
    if (originalProject === undefined) delete process.env.CFGM_PROJECT;
    else process.env.CFGM_PROJECT = originalProject;
    if (originalHome === undefined) delete process.env.CFGM_HOME;
    else process.env.CFGM_HOME = originalHome;
  });

  beforeEach(() => {
    delete process.env.CFGM_PROJECT_ROOT;
    delete process.env.CFGM_PROJECT;
    delete process.env.CFGM_HOME;
  });

  test("resolveStorageRoot — argv --home 은 install-brain.ts 용, .memory-brain 안 붙이고 그 값 그대로", () => {
    const argv = ["bun", "run", "session-start.ts", "--home", "/tmp/brain-home/memory-brain"];
    expect(resolveStorageRoot(argv)).toBe("/tmp/brain-home/memory-brain");
  });

  test("resolveStorageRoot — --home 이 --project-root 보다 우선 (동시 지정은 실제로 안 생기지만 결정론 고정)", () => {
    const argv = ["bun", "run", "session-start.ts", "--home", "/tmp/home-wins", "--project-root", "/tmp/ignored"];
    expect(resolveStorageRoot(argv)).toBe("/tmp/home-wins");
  });

  test("resolveStorageRoot — argv --project-root 만 있으면 그걸로 <path>/.memory-brain", () => {
    const argv = ["bun", "run", "session-start.ts", "--project-root", "/tmp/argv-project"];
    expect(resolveStorageRoot(argv)).toBe(resolve("/tmp/argv-project", ".memory-brain"));
  });

  test("resolveStorageRoot — argv 가 CFGM_HOME/CFGM_PROJECT/CFGM_PROJECT_ROOT 전부보다 우선", () => {
    process.env.CFGM_HOME = "/tmp/env-home";
    process.env.CFGM_PROJECT = "/tmp/env-project";
    process.env.CFGM_PROJECT_ROOT = "/tmp/env-project-root";
    const argv = ["bun", "run", "session-start.ts", "--project-root", "/tmp/argv-wins"];
    expect(resolveStorageRoot(argv)).toBe(resolve("/tmp/argv-wins", ".memory-brain"));
  });

  test("resolveProjectRoot — argv --project-root 최우선", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/env-project-root";
    const argv = ["bun", "run", "session-start.ts", "--project-root", "/tmp/argv-project"];
    expect(resolveProjectRoot(argv)).toBe(resolve("/tmp/argv-project"));
  });

  test("resolveRepoRoot — argv --project-root 최우선", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/env-project-root";
    const argv = ["bun", "run", "cfgm.ts", "--project-root", "/tmp/argv-project"];
    expect(resolveRepoRoot(argv)).toBe(resolve("/tmp/argv-project"));
  });

  test("하위호환 — argv 에 --project-root 가 없으면(기존 env-접두사 설치) 기존 env 우선순위 그대로", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/legacy-env-project";
    const legacyArgv = ["bun", "run", "session-start.ts"]; // 구버전 훅 — argv 에 project-root 없음
    expect(resolveStorageRoot(legacyArgv)).toBe(resolve("/tmp/legacy-env-project", ".memory-brain"));
    expect(resolveProjectRoot(legacyArgv)).toBe(resolve("/tmp/legacy-env-project"));
    expect(resolveRepoRoot(legacyArgv)).toBe(resolve("/tmp/legacy-env-project"));
  });

  test("--project-root 뒤에 값이 없으면(잘못된 호출) 무시하고 다음 우선순위로 폴백", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/fallback-project";
    const malformedArgv = ["bun", "run", "session-start.ts", "--project-root"]; // 값 누락
    expect(resolveStorageRoot(malformedArgv)).toBe(resolve("/tmp/fallback-project", ".memory-brain"));
  });

  test("기본 인자 없이 호출 시 process.argv 를 쓴다 (테스트 러너 argv 엔 --project-root 없음 → env 로 폴백)", () => {
    process.env.CFGM_PROJECT_ROOT = "/tmp/default-arg-project";
    expect(resolveStorageRoot()).toBe(resolve("/tmp/default-arg-project", ".memory-brain"));
  });
});
