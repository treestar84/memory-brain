/**
 * HonchoBridge 가 의존하는 최소 인터페이스.
 *
 * 실제 `Honcho` (from `@honcho-ai/sdk` v2.1.1) instance 와 mock 둘 다 호환되도록
 * structural typing 으로 추출. 본 인터페이스는 SDK 의 일부 메서드만 채택 —
 * 향후 PR 에서 confine 풀 예정.
 *
 * AGPL 격리 (ADR-019): 본 타입은 SDK 의 type 만 답습. SDK 자체는 Apache-2.0.
 * Honcho server 코드는 별도 컨테이너로 격리 (HTTP 호출만).
 */
export interface HonchoClient {
  peer(id: string, options?: HonchoPeerOptions): Promise<HonchoPeer>;
  session(id: string, options?: HonchoSessionOptions): Promise<HonchoSession>;
}

export interface HonchoPeer {
  /**
   * peer 의 inferred representation. SDK 는 `Promise<string>` 반환 —
   * representation 미생성 상태에서는 빈 문자열을 줄 수 있음. 빈 문자열의
   * "null 같은" 의미 매핑은 HonchoBridge.getRepresentation 의 책임.
   */
  representation(options?: HonchoRepresentationOptions): Promise<string>;
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

export interface HonchoPeerOptions {
  metadata?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
}

export interface HonchoSessionOptions {
  metadata?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
}

export interface HonchoRepresentationOptions {
  sessionId?: string;
  targetPeer?: string;
}

export interface HonchoMessageOptions {
  metadata?: Record<string, unknown>;
}
