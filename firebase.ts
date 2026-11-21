import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
} from "firebase/ai";
import type {
  Beat,
  InferenceSource,
  ProductionBibleData,
  RewritePreset,
  Telemetry,
} from "./types";

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

// Offline-first Firestore: writes queue in IndexedDB and sync when back online.
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

const CLOUD_MODEL = "gemini-2.5-flash";

/* ------------------------------------------------------------------ */
/* Cost / byte estimation (clearly estimates, shown as "est." in HUD)  */
/* ------------------------------------------------------------------ */

// Rough USD per 1M tokens for a Flash-class model. Tweak freely.
const PRICE_IN_PER_M = 0.3;
const PRICE_OUT_PER_M = 2.5;

const bytes = (s: string) => new TextEncoder().encode(s).length;
const tokens = (s: string) => Math.ceil(s.length / 4);

function estimateCostUsd(prompt: string, output: string): number {
  return (
    (tokens(prompt) / 1_000_000) * PRICE_IN_PER_M +
    (tokens(output) / 1_000_000) * PRICE_OUT_PER_M
  );
}

/** Normalise whatever the SDK reports into our two-value union. */
function normaliseSource(raw: unknown): InferenceSource {
  return String(raw ?? "").toLowerCase().includes("device")
    ? "ON_DEVICE"
    : "IN_CLOUD";
}

/* ------------------------------------------------------------------ */
/* Hybrid models                                                       */
/* ------------------------------------------------------------------ */

// Fast local iteration. Falls back to cloud automatically if Gemini Nano
// isn't available in this browser (e.g. most mobile browsers today).
const localModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: { model: CLOUD_MODEL },
});

const bibleSchema = Schema.object({
  properties: {
    title: Schema.string(),
    logline: Schema.string(),
    shots: Schema.array({
      items: Schema.object({
        properties: {
          beatId: Schema.string(),
          shotNumber: Schema.number(),
          description: Schema.string(),
          cameraAngle: Schema.string(),
          lens: Schema.string(),
          lighting: Schema.string(),
          sfx: Schema.string(),
          durationSec: Schema.number(),
          klingPrompt: Schema.string(),
          veoPrompt: Schema.string(),
        },
      }),
    }),
  },
});

// Heavy structured synthesis goes to the cloud.
const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_IN_CLOUD,
  inCloudParams: {
    model: CLOUD_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: bibleSchema,
    },
  },
});

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const PRESET_INSTRUCTIONS: Record<RewritePreset, string> = {
  punchier: "Make it punchier and more energetic for a 30-second ad.",
  cinematic: "Make it more cinematic and visual: concrete imagery, motion, light.",
  shorter: "Cut it to the essential action in one or two short sentences.",
  emotional: "Heighten the emotional beat without adding new plot.",
};

export interface RewriteResult {
  text: string;
  telemetry: Telemetry;
}

export async function rewriteBeat(
  beat: Beat,
  preset: RewritePreset,
): Promise<RewriteResult> {
  const prompt =
    `You are a commercial video script editor. ${PRESET_INSTRUCTIONS[preset]}\n` +
    `Return ONLY the rewritten beat, no quotes or commentary.\n\nBeat: ${beat.text}`;

  const t0 = performance.now();
  const result = await localModel.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - t0);

  const text = result.response.text().trim();
  const source = normaliseSource(
    (result.response as unknown as { inferenceSource?: unknown })
      .inferenceSource,
  );

  const telemetry: Telemetry = {
    op: `rewrite:${preset}`,
    source,
    latencyMs,
    egressBytes: source === "ON_DEVICE" ? 0 : bytes(prompt) + bytes(text),
    costSavedUsd: source === "ON_DEVICE" ? estimateCostUsd(prompt, text) : 0,
    at: Date.now(),
  };

  void logEvent(telemetry);
  return { text, telemetry };
}

export interface BibleResult {
  bible: ProductionBibleData;
  telemetry: Telemetry;
}

export async function buildProductionBible(
  beats: Beat[],
): Promise<BibleResult> {
  const timeline = beats
    .map((b, i) => `Beat ${i + 1} (id: ${b.id}): ${b.text}`)
    .join("\n");

  const prompt =
    `You are a commercial director and AI video prompt engineer. ` +
    `From the finalized beats below, produce a Production Bible as JSON: ` +
    `a title, a one-line logline, and one or more shots per beat. ` +
    `Each shot needs: beatId (copy the id), shotNumber (sequential from 1), ` +
    `description, cameraAngle, lens, lighting, sfx, durationSec, ` +
    `klingPrompt (a ready-to-paste Kling prompt), and veoPrompt (a ready-to-paste Veo prompt).\n\n` +
    timeline;

  const t0 = performance.now();
  const result = await cloudModel.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - t0);

  const raw = result.response.text();
  const bible = JSON.parse(raw) as ProductionBibleData;
  const source = normaliseSource(
    (result.response as unknown as { inferenceSource?: unknown })
      .inferenceSource,
  );

  const telemetry: Telemetry = {
    op: "production-bible",
    source,
    latencyMs,
    egressBytes: source === "ON_DEVICE" ? 0 : bytes(prompt) + bytes(raw),
    costSavedUsd: 0,
    at: Date.now(),
  };

  void logEvent(telemetry);
  return { bible, telemetry };
}

/* ------------------------------------------------------------------ */
/* Audit log (offline-capable; never blocks the UI)                    */
/* ------------------------------------------------------------------ */

async function logEvent(t: Telemetry): Promise<void> {
  if (!firebaseConfig.projectId) return;
  try {
    // Don't await server ack: offline, the write queues locally and syncs later.
    void addDoc(collection(db, "auditLog"), {
      ...t,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* audit logging is best-effort */
  }
}
