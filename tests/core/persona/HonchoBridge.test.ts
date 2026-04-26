import { describe, test, expect, beforeEach } from "bun:test";
import { HonchoBridge } from "../../../src/core/persona/HonchoBridge";
import type {
  HonchoClient,
  HonchoMessageInput,
  HonchoPeer,
  HonchoSession,
} from "../../../src/core/persona/types";

interface RecordedAddMessages {
  sessionId: string;
  input: HonchoMessageInput | HonchoMessageInput[];
}

function makeFakeClient(): {
  client: HonchoClient;
  records: RecordedAddMessages[];
  representations: Map<string, string>;
} {
  const records: RecordedAddMessages[] = [];
  const representations = new Map<string, string>();

  const client: HonchoClient = {
    async peer(id: string): Promise<HonchoPeer> {
      return {
        message: (content, options) => ({ peerId: id, content, metadata: options?.metadata }),
        async representation(_opts) {
          // SDK 동작 답습: representation 미생성 시 빈 문자열 반환.
          return representations.get(id) ?? "";
        },
      };
    },
    async session(sessionId: string): Promise<HonchoSession> {
      return {
        async addMessages(input) {
          records.push({ sessionId, input });
          return undefined;
        },
      };
    },
  };

  return { client, records, representations };
}

describe("HonchoBridge", () => {
  let fixture: ReturnType<typeof makeFakeClient>;
  let bridge: HonchoBridge;

  beforeEach(() => {
    fixture = makeFakeClient();
    bridge = new HonchoBridge(fixture.client);
  });

  test("recordMessage → session.addMessages 호출 + peerId/content 보존", async () => {
    await bridge.recordMessage("sess-1", "user-1", "hello world");

    expect(fixture.records).toHaveLength(1);
    const r = fixture.records[0]!;
    expect(r.sessionId).toBe("sess-1");
    const msg = r.input as HonchoMessageInput;
    expect(msg.peerId).toBe("user-1");
    expect(msg.content).toBe("hello world");
  });

  test("getRepresentation — representation 없으면 null", async () => {
    const rep = await bridge.getRepresentation("unknown-peer");
    expect(rep).toBeNull();
  });

  test("getRepresentation — 사전 설정된 representation 반환", async () => {
    fixture.representations.set("user-7", "user prefers terse explanations");
    const rep = await bridge.getRepresentation("user-7");
    expect(rep).toBe("user prefers terse explanations");
  });

  test("recordMessage 다회 호출 → 누적", async () => {
    await bridge.recordMessage("s", "u", "first");
    await bridge.recordMessage("s", "a", "second");
    await bridge.recordMessage("s", "u", "third");
    expect(fixture.records).toHaveLength(3);
    expect((fixture.records[0]!.input as HonchoMessageInput).content).toBe("first");
    expect((fixture.records[2]!.input as HonchoMessageInput).peerId).toBe("u");
  });

  test("getRepresentation options 전달 — 인터페이스 호환", async () => {
    fixture.representations.set("user-x", "session-scoped repr");
    const rep = await bridge.getRepresentation("user-x", { sessionId: "sess-1" });
    expect(rep).toBe("session-scoped repr");
  });
});
