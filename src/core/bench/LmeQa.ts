import type { LmeQuestion } from "./LongMemEval";
import { sessionToText } from "./LongMemEval";

/**
 * LongMemEval 풀 QA 트랙 — host-위임 (V3.29 ②).
 *
 * 공식 점수 (QA accuracy) 는 LLM 이 답변을 생성하고 LLM judge 가 채점해야
 * 한다. docs/RULES.md 원칙 2 에 따라 SDK 를 직접 호출하지 않고, normalize
 * 큐와 동일한 file-based pending job 패턴으로 host LLM (PAI 세션) 에 위임한다:
 *
 *   1. cfgm-lme-enqueue  — 질문별 answer job 생성 (retrieval top-k 컨텍스트 포함)
 *   2. PAI 세션          — job 처리 → answers/<qid>.json
 *   3. cfgm-lme-score    — proxy 채점 (EM / token-F1) + judge job 생성 (--judge-enqueue)
 *   4. PAI 세션          — judge job 처리 → judgments/<qid>.json
 *   5. cfgm-lme-score --collect — 공식 지표 (judge accuracy) 집계
 *
 * 본 모듈은 순수 함수만 — 파일 I/O 는 CLI 책임. ground truth 는 answer job
 * 에 절대 포함하지 않는다 (누출 방지). judge job 에만 포함된다.
 */

export interface LmeAnswerJobInput {
  question: LmeQuestion;
  /** retrieval 이 고른 세션 id (top-k 순서) */
  retrievedSessionIds: string[];
  answersDir: string;
}

// frontmatter 값 주입 방어 — id/type 류 필드는 slug 문자만 허용 (개행·콜론
// 등 YAML 구분자 완전 제거 → 파일 경로로도 안전). question_id 는
// parseLmeQuestions 의 SAFE_ID_RE 로 이미 보장되지만, 다른 호출 경로로
// 만들어진 객체에도 안전하도록 여기서도 정화한다.
function fmSafe(v: string): string {
  const safe = v.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return safe.length > 0 ? safe : "unnamed";
}

/** answer job 파일 내용 생성. ground truth 미포함. */
export function buildAnswerJob(input: LmeAnswerJobInput): string {
  const q = input.question;
  const idToIdx = new Map(q.haystack_session_ids.map((sid, i) => [sid, i] as const));
  const contexts = input.retrievedSessionIds
    .map((sid) => {
      const idx = idToIdx.get(sid);
      if (idx === undefined) return null;
      return `### session ${sid}\n\n${sessionToText(q.haystack_sessions[idx] ?? [], q.haystack_dates?.[idx])}`;
    })
    .filter((s): s is string => s !== null);

  const qid = fmSafe(q.question_id);
  return [
    `---`,
    `job_id: lme-answer-${qid}`,
    `status: pending`,
    `attempts: 0`,
    `max_attempts: 3`,
    `question_id: ${qid}`,
    `question_type: ${fmSafe(q.question_type)}`,
    `output_path: ${input.answersDir}/${qid}.json`,
    `---`,
    ``,
    `# LongMemEval answer job — \`${q.question_id}\``,
    ``,
    `아래 대화 기록 **만을 근거로** 질문에 답하라. 기록에 답이 없으면 정확히 \`"The information is not available"\` 이라고 답하라 (추측 금지).`,
    ``,
    `## 질문`,
    ``,
    `- 질문 시점: ${q.question_date ?? "(미상)"}`,
    `- 질문: ${q.question}`,
    ``,
    `## 대화 기록 (retrieval top-${input.retrievedSessionIds.length})`,
    ``,
    ...contexts,
    ``,
    `## 출력`,
    ``,
    `\`output_path\` 에 다음 JSON 만 저장 (markdown/prose 금지):`,
    ``,
    `\`{ "question_id": "${q.question_id}", "answer": "<간결한 답변 문장>" }\``,
    ``,
    `저장 후 본 파일 frontmatter 를 \`status: done\` 으로 갱신.`,
    ``,
  ].join("\n");
}

export interface LmeAnswer {
  question_id: string;
  answer: string;
}

export function parseLmeAnswer(raw: unknown): LmeAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.question_id !== "string" || typeof r.answer !== "string") return null;
  return { question_id: r.question_id, answer: r.answer };
}

/** 정규화 — 소문자 + 구두점 제거 + 공백 축약 (SQuAD 계열 관례). */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** token-level F1 (SQuAD 방식) — proxy 지표. 공식 지표는 judge accuracy. */
export function tokenF1(prediction: string, groundTruth: string): number {
  const p = normalizeAnswer(prediction).split(" ").filter(Boolean);
  const g = normalizeAnswer(groundTruth).split(" ").filter(Boolean);
  if (p.length === 0 || g.length === 0) return p.length === g.length ? 1 : 0;
  const gCounts = new Map<string, number>();
  for (const t of g) gCounts.set(t, (gCounts.get(t) ?? 0) + 1);
  let overlap = 0;
  for (const t of p) {
    const c = gCounts.get(t) ?? 0;
    if (c > 0) {
      overlap++;
      gCounts.set(t, c - 1);
    }
  }
  if (overlap === 0) return 0;
  const precision = overlap / p.length;
  const recall = overlap / g.length;
  return (2 * precision * recall) / (precision + recall);
}

export interface LmeProxyScore {
  questionId: string;
  questionType: string;
  exactMatch: boolean;
  /** 정답이 답변에 substring 포함 (정규화 후) */
  containsMatch: boolean;
  f1: number;
}

export function scoreAnswerProxy(q: LmeQuestion, answer: string): LmeProxyScore {
  const truth = typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer ?? "");
  const np = normalizeAnswer(answer);
  const ng = normalizeAnswer(truth);
  return {
    questionId: q.question_id,
    questionType: q.question_type,
    exactMatch: np === ng && ng.length > 0,
    containsMatch: ng.length > 0 && np.includes(ng),
    f1: tokenF1(answer, truth),
  };
}

/** judge job — 여기에만 ground truth 포함. host LLM 이 yes/no 판정. */
export function buildJudgeJob(q: LmeQuestion, answer: string, judgmentsDir: string): string {
  const truth = typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer ?? "");
  const qid = fmSafe(q.question_id);
  return [
    `---`,
    `job_id: lme-judge-${qid}`,
    `status: pending`,
    `attempts: 0`,
    `max_attempts: 3`,
    `question_id: ${qid}`,
    `output_path: ${judgmentsDir}/${qid}.json`,
    `---`,
    ``,
    `# LongMemEval judge job — \`${q.question_id}\``,
    ``,
    `모델 답변이 정답과 의미적으로 일치하는지 판정하라 (LongMemEval 공식 프로토콜 — 표현 차이는 허용, 사실 불일치는 불허).`,
    ``,
    `- 질문: ${q.question}`,
    `- 정답: ${truth}`,
    `- 모델 답변: ${answer}`,
    ``,
    `## 출력`,
    ``,
    `\`output_path\` 에 다음 JSON 만 저장:`,
    ``,
    `\`{ "question_id": "${q.question_id}", "correct": true 또는 false }\``,
    ``,
    `저장 후 본 파일 frontmatter 를 \`status: done\` 으로 갱신.`,
    ``,
  ].join("\n");
}

export interface LmeJudgment {
  question_id: string;
  correct: boolean;
}

export function parseLmeJudgment(raw: unknown): LmeJudgment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.question_id !== "string" || typeof r.correct !== "boolean") return null;
  return { question_id: r.question_id, correct: r.correct };
}

export interface LmeQaAggregate {
  answered: number;
  total: number;
  exactMatch: number;
  containsMatch: number;
  meanF1: number;
  /** judge 판정 수집 시에만 (공식 지표) */
  judgeAccuracy: number | null;
  judgedCount: number;
  byType: Array<{ questionType: string; count: number; meanF1: number; judgeAccuracy: number | null }>;
}

export function aggregateQa(
  scores: LmeProxyScore[],
  judgments: Map<string, boolean>,
  total: number,
): LmeQaAggregate {
  const judged = scores.filter((s) => judgments.has(s.questionId));
  const types = Array.from(new Set(scores.map((s) => s.questionType))).sort();
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    answered: scores.length,
    total,
    exactMatch: mean(scores.map((s) => (s.exactMatch ? 1 : 0))),
    containsMatch: mean(scores.map((s) => (s.containsMatch ? 1 : 0))),
    meanF1: mean(scores.map((s) => s.f1)),
    judgeAccuracy:
      judged.length === 0 ? null : mean(judged.map((s) => (judgments.get(s.questionId) ? 1 : 0))),
    judgedCount: judged.length,
    byType: types.map((t) => {
      const subset = scores.filter((s) => s.questionType === t);
      const subJudged = subset.filter((s) => judgments.has(s.questionId));
      return {
        questionType: t,
        count: subset.length,
        meanF1: mean(subset.map((s) => s.f1)),
        judgeAccuracy:
          subJudged.length === 0
            ? null
            : mean(subJudged.map((s) => (judgments.get(s.questionId) ? 1 : 0))),
      };
    }),
  };
}
