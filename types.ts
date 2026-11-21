export type InferenceSource = "ON_DEVICE" | "IN_CLOUD";

export interface Beat {
  id: string;
  text: string;
}

export interface Telemetry {
  op: string;
  source: InferenceSource;
  latencyMs: number;
  /** 0 when on-device; otherwise estimated request + response bytes */
  egressBytes: number;
  /** Estimated USD saved by not calling the cloud */
  costSavedUsd: number;
  at: number;
}

export interface Shot {
  beatId: string;
  shotNumber: number;
  description: string;
  cameraAngle: string;
  lens: string;
  lighting: string;
  sfx: string;
  durationSec: number;
  klingPrompt: string;
  veoPrompt: string;
}

export interface ProductionBibleData {
  title: string;
  logline: string;
  shots: Shot[];
}

export type RewritePreset = "punchier" | "cinematic" | "shorter" | "emotional";
