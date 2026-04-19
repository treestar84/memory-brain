---
name: cfgm-rotate
description: resolved 후 90일이 지난 문제를 .archive/로 이동한다. 기본 dry-run이므로 --apply 없이는 실제 이동 안 함.
---

# /cfgm-rotate

**역할**: 오래된 해결 완료 문제를 `.archive/<problemId>/`로 이동하고 `.archive/index.json`에 등록한다. 기본 동작은 dry-run(미리보기)이므로 `--apply` 플래그를 명시해야 실제 이동이 일어난다.

## 대상 기준

- `status === "resolved"` AND
- `resolvedAt + 90일` 이상 경과

`active`와 `archived` 문제는 대상이 아님.

## 실행

```bash
# 미리보기 (기본 — 아무것도 이동하지 않음)
bun run bin/cfgm-rotate.ts

# 실제 이동
bun run bin/cfgm-rotate.ts --apply

# JSON 출력 (스크립팅용)
bun run bin/cfgm-rotate.ts --apply --json
```

## 동작

1. `state/active-problem.json`에서 resolved 문제 목록 로드
2. `resolvedAt + 90일` 경과 여부 확인
3. dry-run: 후보 목록만 출력
4. apply:
   - `.memory-brain/problems/<id>/` 파일 전체를 `.memory-brain/.archive/<id>/`로 복사
   - 원본 디렉터리 삭제
   - `.archive/index.json` 갱신
   - 문제 status를 `archived`로 변경

## 출력 예시 (dry-run)

```
## 아카이브 대상 미리보기 (dry-run)
기준: resolved 후 90일 경과

  - prob-abc12345

1개 대상. 실행하려면 --apply 추가:
  bun run bin/cfgm-rotate.ts --apply
```

## 출력 예시 (apply)

```
## 아카이브 실행 결과
  ✅ prob-abc12345 → .archive/prob-abc12345/

1개 아카이브 완료.
인덱스: .memory-brain/.archive/index.json
```

## .archive/index.json 구조

```json
{
  "version": "archive-index@1.0.0",
  "entries": [
    {
      "problemId": "prob-abc12345",
      "title": "auth bug",
      "slug": "auth-bug",
      "resolvedAt": "2026-01-10T00:00:00.000Z",
      "archivedAt": "2026-04-19T10:00:00.000Z"
    }
  ]
}
```

## 주의

- 이동은 **되돌릴 수 없다**. `--apply` 전에 dry-run으로 대상을 반드시 확인하라.
- 아카이브된 문제의 파일은 `.memory-brain/.archive/`에 보존되므로 완전 삭제가 아님.
- active 문제는 대상이 아니므로 `--apply`를 실행해도 현재 작업 중인 문제에 영향 없음.
