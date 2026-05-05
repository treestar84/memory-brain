import { parse } from "yaml";
import { resolve } from "node:path";
import type { Action, ResourceScope } from "./ssl";

/**
 * Canonical Action Store (PR-V3.17a) — 외부 yaml 로 정의된 재사용 가능한
 * action 패턴 사전. SSL Logical 노드가 actionRef 로 참조하면 inline 표현
 * 대신 store 의 정의가 사용된다.
 *
 * 확장성 (사용자 강조 제약):
 * - 신규 항목은 items 섹션에 yaml 추가만으로 가능. 코드 PR 불필요.
 * - 사용자 프로젝트 별 도메인 어휘는 extensions 섹션 (메모리 브레인 본체는
 *   도메인-중립 — items 에는 도메인 어휘 절대 X).
 * - 본 모듈은 yaml 파싱 + 검증 + lookup 만 담당. action/resources 의 enum
 *   유효성은 ssl.ts 의 isAction/isResourceScope 가 cross-check.
 *
 * 본 store 가 "canonical" 인 이유: 같은 패턴은 정확히 같은 ID 로 표현되어
 * LLM/사람/메모리 브레인 모두 결정적으로 인식한다 (사용자 강조: "LLM 혼동 X").
 */

export type CanonicalActionDef = {
  action: Action;
  resources: ResourceScope[];
  description: string;
};

export type CanonicalActionStore = {
  storeVersion: string;
  items: Record<string, CanonicalActionDef>;
  extensions: Record<string, CanonicalActionDef>;
};

/** Default path. Override 가능 (테스트 등). */
export function defaultCanonicalActionsPath(memoryDir: string): string {
  return resolve(memoryDir, "concepts/_ssl/_canonical/actions.yaml");
}

/**
 * yaml 파일 로드 + 구조 검증. 파일이 없으면 빈 store 반환 (graceful — 신규
 * 프로젝트가 canonical 아직 안 만든 경우).
 */
export async function loadCanonicalActions(path: string): Promise<CanonicalActionStore> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { storeVersion: "0.0.0", items: {}, extensions: {} };
  }
  const text = await file.text();
  const raw = parse(text) as {
    storeVersion?: string;
    items?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
  };
  return {
    storeVersion: raw.storeVersion ?? "unknown",
    items: validateItemMap(raw.items ?? {}, "items"),
    extensions: validateItemMap(raw.extensions ?? {}, "extensions"),
  };
}

/** 합집합 view — items + extensions. 충돌 시 extensions 가 우선 (사용자 override). */
export function flattenCanonicalActions(store: CanonicalActionStore): Record<string, CanonicalActionDef> {
  return { ...store.items, ...store.extensions };
}

/** ref ID → 정의. 없으면 null. */
export function resolveActionRef(ref: string, store: CanonicalActionStore): CanonicalActionDef | null {
  const flat = flattenCanonicalActions(store);
  return flat[ref] ?? null;
}

function validateItemMap(raw: Record<string, unknown>, section: string): Record<string, CanonicalActionDef> {
  const out: Record<string, CanonicalActionDef> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isValidId(id)) {
      throw new Error(`canonical store: invalid id '${id}' in ${section} (must be UPPER_SNAKE)`);
    }
    if (!value || typeof value !== "object") {
      throw new Error(`canonical store: ${section}.${id} must be an object`);
    }
    const v = value as { action?: unknown; resources?: unknown; description?: unknown };
    if (typeof v.action !== "string") {
      throw new Error(`canonical store: ${section}.${id}.action must be string`);
    }
    if (!Array.isArray(v.resources) || !v.resources.every((r) => typeof r === "string")) {
      throw new Error(`canonical store: ${section}.${id}.resources must be string[]`);
    }
    if (typeof v.description !== "string") {
      throw new Error(`canonical store: ${section}.${id}.description must be string`);
    }
    out[id] = {
      action: v.action as Action,
      resources: v.resources as ResourceScope[],
      description: v.description,
    };
  }
  return out;
}

function isValidId(id: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(id);
}
