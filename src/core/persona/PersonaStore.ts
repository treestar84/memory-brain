import type { Storage } from "../storage/Storage";
import type { Clock } from "../clock/Clock";
import type {
  Peer,
  PeerKind,
  Session,
  Message,
  Representation,
  EvidencePointer,
} from "./types";

const PEERS_PATH = "memory/profile/peers.jsonl";
const SESSIONS_PATH = "memory/profile/sessions.jsonl";
const MESSAGES_PATH = "memory/profile/messages.jsonl";
const REPRESENTATIONS_PATH = "memory/profile/representations.jsonl";

/**
 * 자체 PersonaStore (ADR-021).
 *
 * Honcho 패턴 답습 — peer / session / message / representation 추상.
 * 외부 server·DB·LLM 의존 0. 모든 저장은 markdown + jsonl 기반.
 *
 * 저장 정책:
 * - peers / sessions / representations: append-only + last-wins reduce.
 * - messages: 순수 append-only (history 보존).
 *
 * representation 생성은 1차에서 **수동 upsert** — Claude 본체가 의미 합성 후 호출.
 * 자동 LLM 호출 도입은 후속 ADR.
 */
export class PersonaStore {
  constructor(private readonly storage: Storage, private readonly clock: Clock) {}

  async recordPeer(peerId: string, kind: PeerKind, metadata?: Record<string, unknown>): Promise<void> {
    const now = this.clock.isoNow();
    const existing = await this.getPeer(peerId);
    const peer: Peer = {
      peerId,
      kind,
      metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.storage.appendJsonl(PEERS_PATH, peer);
  }

  async recordSession(sessionId: string, peerIds: string[]): Promise<void> {
    const now = this.clock.isoNow();
    const existing = await this.getSession(sessionId);
    const session: Session = {
      sessionId,
      peerIds,
      openedAt: existing?.openedAt ?? now,
      updatedAt: now,
    };
    await this.storage.appendJsonl(SESSIONS_PATH, session);
  }

  async recordMessage(
    sessionId: string,
    peerId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const message: Message = {
      sessionId,
      peerId,
      content,
      timestamp: this.clock.isoNow(),
      metadata,
    };
    await this.storage.appendJsonl(MESSAGES_PATH, message);
  }

  async setRepresentation(
    peerId: string,
    text: string,
    evidence: EvidencePointer[] = [],
    decidedBy: string = "user",
  ): Promise<void> {
    const now = this.clock.isoNow();
    const existing = await this.getRepresentation(peerId);
    const rep: Representation = {
      peerId,
      text,
      evidence,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      decidedBy,
    };
    await this.storage.appendJsonl(REPRESENTATIONS_PATH, rep);
  }

  async getPeer(peerId: string): Promise<Peer | null> {
    const all = await this.listPeers();
    return all.find((p) => p.peerId === peerId) ?? null;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const all = await this.listSessions();
    return all.find((s) => s.sessionId === sessionId) ?? null;
  }

  async getRepresentation(peerId: string): Promise<Representation | null> {
    const all = await this.storage.readJsonl<Representation>(REPRESENTATIONS_PATH);
    const lastWins = new Map<string, Representation>();
    for (const r of all) lastWins.set(r.peerId, r);
    return lastWins.get(peerId) ?? null;
  }

  async listPeers(): Promise<Peer[]> {
    const all = await this.storage.readJsonl<Peer>(PEERS_PATH);
    const lastWins = new Map<string, Peer>();
    for (const p of all) lastWins.set(p.peerId, p);
    return Array.from(lastWins.values());
  }

  async listSessions(): Promise<Session[]> {
    const all = await this.storage.readJsonl<Session>(SESSIONS_PATH);
    const lastWins = new Map<string, Session>();
    for (const s of all) lastWins.set(s.sessionId, s);
    return Array.from(lastWins.values());
  }

  async listMessages(sessionId?: string): Promise<Message[]> {
    const all = await this.storage.readJsonl<Message>(MESSAGES_PATH);
    if (sessionId === undefined) return all;
    return all.filter((m) => m.sessionId === sessionId);
  }
}
