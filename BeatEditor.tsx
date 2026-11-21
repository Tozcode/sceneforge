import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import type { Beat, RewritePreset } from "../lib/types";

interface Props {
  beat: Beat | undefined;
  index: number;
  total: number;
  rewriting: boolean;
  escalating: boolean;
  canAdd: boolean;
  canRemove: boolean;
  canEscalate: boolean;
  onChange: (text: string) => void;
  onRewrite: (preset: RewritePreset) => void;
  onAdd: () => void;
  onRemove: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEscalate: () => void;
}

const PRESETS: { id: RewritePreset; label: string }[] = [
  { id: "punchier", label: "Punchier" },
  { id: "cinematic", label: "Cinematic" },
  { id: "shorter", label: "Shorter" },
  { id: "emotional", label: "Emotional" },
];

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-full border border-white/60 bg-white/30 text-slate-800 hover:bg-white/50 disabled:opacity-40";

export default function BeatEditor({
  beat,
  index,
  total,
  rewriting,
  escalating,
  canAdd,
  canRemove,
  canEscalate,
  onChange,
  onRewrite,
  onAdd,
  onRemove,
  onPrev,
  onNext,
  onEscalate,
}: Props) {
  return (
    <section className="pointer-events-auto rounded-3xl border border-white/60 bg-white/25 p-3 text-slate-900 shadow-[0_8px_30px_rgba(20,40,60,0.2)] backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs tracking-widest text-slate-800">
          BEAT {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <div className="flex gap-1.5">
          <button className={iconBtn} onClick={onPrev} aria-label="Previous beat">
            <ChevronLeft size={16} />
          </button>
          <button className={iconBtn} onClick={onNext} aria-label="Next beat">
            <ChevronRight size={16} />
          </button>
          <button className={iconBtn} onClick={onAdd} disabled={!canAdd} aria-label="Add beat">
            <Plus size={16} />
          </button>
          <button
            className={iconBtn}
            onClick={onRemove}
            disabled={!canRemove}
            aria-label="Remove beat"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <textarea
        value={beat?.text ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Describe the beat…"
        className="w-full resize-none rounded-2xl border border-white/60 bg-white/40 p-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-500"
      />

      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
        {rewriting ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-700">
            <Loader2 size={13} className="animate-spin" /> Rewriting…
          </span>
        ) : (
          <>
            <Wand2 size={13} className="shrink-0 text-slate-600" />
            {PRESETS.map((p) => (
              <button
                key={p.id}
                disabled={!beat?.text.trim()}
                onClick={() => onRewrite(p.id)}
                className="shrink-0 rounded-full border border-white/60 bg-white/30 px-3 py-1 text-xs text-slate-800 hover:bg-white/55 disabled:opacity-40"
              >
                {p.label}
              </button>
            ))}
          </>
        )}
        <button
          onClick={onEscalate}
          disabled={escalating || !canEscalate}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {escalating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          Escalate to Cloud
        </button>
      </div>
    </section>
  );
}
