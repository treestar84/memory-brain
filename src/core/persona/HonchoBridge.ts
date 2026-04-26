import type { HonchoClient } from "./types";

/**
 * Honcho self-host server 와 memory-brain 사이 어댑터 (PR-V3.1, ADR-019).
 *
 * - Honcho 서버는 별도 docker container 로 격리 (AGPL-3.0).
 * - 본 클래스는 `@honcho-ai/sdk` (Apache-2.0) 만 의존.
 * - `HonchoClient` interface 로 mock 가능 (단위 테스트 용도).
 *
 * 본 PR 범위: peer/session 매핑 + recordMessage / getRepresentation 1차.
 * 후속 PR-V3.2~V3.8 에서 hooks · request 라우터와 wiring.
 */
export class HonchoBridge {
  constructor(private readonly client: HonchoClient) {}

  /**
   * 사용자/에이전트 발화 1건을 Honcho session 에 기록.
   * Honcho server 가 비동기 derived conclusion 생성 — representation 은 후속 호출에서.
   */
  async recordMessage(sessionId: string, peerId: string, content: string): Promise<void> {
    const peer = await this.client.peer(peerId);
    const session = await this.client.session(sessionId);
    const msg = peer.message(content);
    await session.addMessages(msg);
  }

  /**
   * peer 의 inferred representation 가져오기.
   * SDK 는 `Promise<string>` 반환 — 빈 문자열을 본 어댑터에서 null 로 매핑한다.
   * representation 미생성 상태면 null.
   */
  async getRepresentation(
    peerId: string,
    options: { sessionId?: string; targetPeer?: string } = {},
  ): Promise<string | null> {
    const peer = await this.client.peer(peerId);
    const result = await peer.representation(options);
    return result === "" ? null : result;
  }
}
