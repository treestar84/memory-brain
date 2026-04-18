import type { FlowGraph } from "../../flow/types";
import type { GapCandidate } from "../types";
import type { Clock } from "../../clock/Clock";

export interface Detector {
  readonly id: string;
  readonly severity: number;
  detect(graph: FlowGraph, clock: Clock): GapCandidate[];
}
