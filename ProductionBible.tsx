import { Clapperboard, Download, Loader2, Sparkles } from "lucide-react";
import type { ProductionBibleData, Telemetry } from "../lib/types";

interface Props {
  bible: ProductionBibleData | null;
  loading: boolean;
  error: string | null;
  audit: Telemetry[];
  canGenerate: boolean;
  onGenerate: () => void;
}

function download(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toMarkdown(b: ProductionBibleData): string {
  const lines = [`# ${b.title}`, "", `_${b.logline}_`, ""];
  for (const s of b.shots) {
    lines.push(
      `## Shot ${s.shotNumber} (${s.durationSec}s)`,
      s.description,
      "",
      `- **Camera:** ${s.cameraAngle} · ${s.lens}`,
      `- **Lighting:** ${s.lighting}`,
      `- **SFX:** ${s.sfx}`,
      `- **Kling:** ${s.klingPrompt}`,
      `- **Veo:** ${s.veoPrompt}`,
      "",
    );
  }
  return lines.join("\n");
}

export default function ProductionBible({
  bible,
  loading,
  error,
  audit,
  canGenerate,
  onGenerate,
}: Props) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-200">Production Bible</h2>
        <div className="flex gap-2">
          {bible && (
            <>
              <button
                onClick={() =>
                  download("production-bible.md", "text/markdown", toMarkdown(bible))
                }
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                <Download size={13} /> .md
              </button>
              <button
                onClick={() =>
                  download(
                    "production-bible.json",
                    "application/json",
                    JSON.stringify(bible, null, 2),
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                <Download size={13} /> .json
              </button>
            </>
          )}
          <button
            onClick={onGenerate}
            disabled={loading || !canGenerate}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Escalate to Cloud
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {!bible && !loading && !error && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
          <Clapperboard size={22} />
          Iterate on your beats locally, then escalate to generate the full
          shot list.
        </div>
      )}

      {bible && (
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <h3 className="font-semibold text-zinc-100">{bible.title}</h3>
            <p className="text-sm text-zinc-400">{bible.logline}</p>
          </div>

          {bible.shots.map((s) => (
            <article
              key={`${s.beatId}-${s.shotNumber}`}
              className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-amber-400">
                  SHOT {String(s.shotNumber).padStart(2, "0")}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {s.durationSec}s
                </span>
              </div>
              <p className="text-zinc-200">{s.description}</p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                <Field k="Camera" v={`${s.cameraAngle} · ${s.lens}`} />
                <Field k="Lighting" v={s.lighting} />
                <Field k="SFX" v={s.sfx} />
              </dl>
              <Prompt label="Kling" text={s.klingPrompt} />
              <Prompt label="Veo" text={s.veoPrompt} />
            </article>
          ))}
        </div>
      )}

      {audit.length > 0 && (
        <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
          <summary className="cursor-pointer text-zinc-400">
            Audit log ({audit.length})
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-zinc-400">
            {[...audit].reverse().map((t) => (
              <li key={t.at}>
                {new Date(t.at).toLocaleTimeString()} · {t.op} · {t.source} ·{" "}
                {t.latencyMs}ms · {t.egressBytes}B
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-zinc-300">{v}</dd>
    </div>
  );
}

function Prompt({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md bg-zinc-950 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase text-zinc-500">
          {label} prompt
        </span>
        <button
          onClick={() => navigator.clipboard?.writeText(text)}
          className="text-[10px] text-zinc-500 hover:text-amber-400"
        >
          copy
        </button>
      </div>
      <p className="text-xs text-zinc-300">{text}</p>
    </div>
  );
}
