import { createHash } from "node:crypto";
import type { FlowBlockType } from "../flow/types";

export class ContentHasher {
  hash(type: FlowBlockType, label: string): string {
    const normalized = label
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return createHash("sha256").update(JSON.stringify([type, normalized])).digest("hex");
  }
}
