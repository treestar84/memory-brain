# ADR-002: OntologyModule에 YAML 포맷 사용

**날짜**: 2026-04-18  
**상태**: 채택됨  
**관련 에픽**: Epic 4

---

## 결정

`problems/<id>/ontology.module.yaml`은 JSON 대신 YAML로 저장한다. FlowGraph(`flow-graph.json`)는 JSON을 유지한다.

## 배경

OntologyModule은 플로우 템플릿 파일(`flow-patterns/*.yaml`)과 같은 포맷을 사용해 사람이 직접 편집하거나 승격 레지스트리에서 재사용하기 쉽게 한다. YAML은 `js-yaml`의 `parse`/`stringify`로 처리.

## 결과

- `storage.writeRaw(path, stringify(data))` / `storage.readText(path)` + `parse()` 패턴 사용
- `writeJsonAtomic` (JSON) 대신 `writeRaw` (YAML) 사용
- PromotionEngine이 `userStorage`에 복사할 때도 동일한 YAML 포맷 유지

## 대안

- JSON 통일: 플로우 템플릿과 포맷 불일치, 사람이 편집하기 불편 → 거부
