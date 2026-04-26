/**
 * PersonaStore 도메인 타입 (ADR-021).
 *
 * Honcho 모델 답습: peer / session / message / representation.
 * 자체 markdown + jsonl 저장 (`memory/profile/*.jsonl`).
 * 외부 server / DB / LLM key 의존 없음 — local-first.
 */

export const PEER_KINDS = ["user", "agent", "external"] as const;
export type PeerKind = (typeof PEER_KINDS)[number];

export interface Peer {
  peerId: string;
  kind: PeerKind;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  sessionId: string;
  peerIds: string[];
  openedAt: string;
  updatedAt: string;
}

export interface Message {
  sessionId: string;
  peerId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface EvidencePointer {
  source: string;
  quote?: string | null;
}

export interface Representation {
  peerId: string;
  text: string;
  evidence: EvidencePointer[];
  createdAt: string;
  updatedAt: string;
  decidedBy: string;
}
