/**
 * HonchoBridge 가 의존하는 최소 인터페이스.
 *
 * 실제 `Honcho` (from `@honcho-ai/sdk`) instance 와 mock 둘 다 호환되도록
 * structural typing 으로 추출. 본 인터페이스는 SDK 의 일부 메서드만 채택 —
 * 향후 PR 에서 confine 풀 예정.
 *
 * AGPL 격리 (ADR-019): 본 타입은 SDK 의 type 만 답습. SDK 자체는 Apache-2.0.
 * Honcho server 코드는 별도 컨테이너로 격리 (HTTP 호출만).
 */
export interface HonchoClient {
  peer(id: string): Promise<HonchoPeer>;
  session(id: string): Promise<HonchoSession>;
}

export interface HonchoPeer {
  /** peer 의 inferred representation (string 또는 null) */
  representation(options?: HonchoRepresentationOptions): Promise<string | null>;
  /** peer 가 보낼 MessageInput 생성 (즉시 반환, 전송은 session.addMessages 가 수행) */
  message(content: string, options?: HonchoMessageOptions): HonchoMessageInput;
}

export interface HonchoSession {
  /** 메시지 추가 (단건 또는 배열) */
  addMessages(input: HonchoMessageInput | HonchoMessageInput[]): Promise<unknown>;
}

export interface HonchoMessageInput {
  peerId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface HonchoRepresentationOptions {
  sessionId?: string;
  targetPeer?: string;
}

export interface HonchoMessageOptions {
  metadata?: Record<string, unknown>;
}
