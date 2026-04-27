import type { ClassificationResult, RequestCategory } from "./types";

/**
 * 1차 keyword/heuristic 분류기 (PR-V3.3).
 *
 * 단순 정규식 매칭. LLM 기반 분류는 후속 PR.
 * 다중 카테고리 가능. QUICK 은 다른 카테고리 매치 안 되고 길이 짧을 때 fallback.
 */

const QUICK_LENGTH_THRESHOLD = 30; // 문자수, fallback 임계값

interface CategoryRule {
  category: RequestCategory;
  patterns: RegExp[];
}

const RULES: CategoryRule[] = [
  {
    category: "DEEP",
    patterns: [
      /\b(analy[sz]e|deep[- ]?dive|architecture|strategy|design)\b/i,
      /(분석|설계|전략|아키텍처|왜\s|어떻게\s.{10,})/,
    ],
  },
  {
    category: "PROJECT",
    patterns: [
      /\b(PR-?\w+|ADR-?\w+|epic|phase\s*\w+)\b/i,
      /(프로젝트|에픽|페이즈|이번\s*PR)/,
    ],
  },
  {
    category: "PERSONAL",
    patterns: [
      /\b(I (prefer|like|want|need)|my (preference|goal|style))\b/i,
      /(나는\s|내\s*(선호|목표|스타일)|사용자가)/,
    ],
  },
  {
    category: "VERIFY",
    patterns: [
      /\b(verify|confirm|evidence|source|really\??)\b/i,
      /(근거|확인|검증|정말|진짜|맞아\??|틀리지)/,
    ],
  },
  {
    category: "WRITE",
    patterns: [
      /\b(save|remember|record|log|memorize|store)\b/i,
      /(저장|기록|메모|기억해|남겨)/,
    ],
  },
  {
    category: "CODE",
    patterns: [
      /\b(implement|refactor|fix|bug|function|class|test)\b/i,
      /(코드|구현|리팩|함수|클래스|테스트)/,
      /[`][\w./-]+[`]/, // backtick-wrapped path/symbol
      /\b\w+\.(ts|tsx|js|jsx|py|go|rs|md)\b/, // file extension
    ],
  },
  {
    category: "RESEARCH",
    patterns: [
      /\b(research|investigate|compare|library|oss|opensource)\b/i,
      /(조사|비교|라이브러리|오픈\s?소스|찾아봐|검색해)/,
      /https?:\/\//i,
    ],
  },
  {
    category: "CONFLICT",
    patterns: [
      /\b(conflict|contradict|supersede|inconsistent|disagree)\b/i,
      /(충돌|모순|상충|반대로|이전과\s*다르)/,
    ],
  },
  {
    category: "MAINTENANCE",
    patterns: [
      /\b(cleanup|compact|prune|lint|archive|decay|garbage)\b/i,
      /(정리|압축|청소|아카이브|쇠퇴|stale)/,
    ],
  },
];

export class RequestClassifier {
  classify(text: string): ClassificationResult {
    const matched = new Map<RequestCategory, string[]>();
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          if (!matched.has(rule.category)) matched.set(rule.category, []);
          matched.get(rule.category)!.push(pattern.source);
        }
      }
    }

    const evidence: ClassificationResult["evidence"] = [];
    for (const [cat, patterns] of matched) {
      // 카테고리당 첫 매치만 evidence 로 (중복 제거)
      evidence.push({ category: cat, pattern: patterns[0]! });
    }

    let categories: RequestCategory[] = Array.from(matched.keys());

    // QUICK fallback: 다른 카테고리 매치 없고 텍스트 짧을 때
    if (categories.length === 0 && text.trim().length <= QUICK_LENGTH_THRESHOLD) {
      categories = ["QUICK"];
    } else if (categories.length === 0) {
      // 짧지도 않고 매치도 없으면 DEEP 으로 fallback (보수적)
      categories = ["DEEP"];
    }

    return { categories, evidence };
  }
}
