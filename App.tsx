import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { X } from "lucide-react";
import SceneStage, { type StageApi } from "./components/SceneStage";
import TelemetryHUD from "./components/TelemetryHUD";
import BeatEditor from "./components/BeatEditor";
import ProductionBible from "./components/ProductionBible";
import { buildProductionBible, rewriteBeat } from "./lib/firebase";
import type {
  Beat,
  ProductionBibleData,
  RewritePreset,
  Telemetry,
} from "./lib/types";

const MAX_BEATS = 12;
const uid = () => crypto.randomUUID().slice(0, 8);

const SEED: Beat[] = [
  { id: uid(), text: "A tired runner laces up at dawn in a quiet Lagos street." },
  { id: uid(), text: "She sprints past waking markets; the city hums with her pace." },
  { id: uid(), text: "She crosses the finish line, product held high. Logo slam." },
];

export default function App() {
  const [beats, setBeats] = useState<Beat[]>(SEED);
  const [activeId, setActiveId] = useState<string | null>(SEED[0].id);
  const [focused, setFocused] = useState(false);
  const [bible, setBible] = useState<ProductionBibleData | null>(null);
  const [audit, setAudit] = useState<Telemetry[]>([]);
  const [rewriting, setRewriting] = useState(false);
  const [loadingBible, setLoadingBible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [drawer, setDrawer] = useState(false);
  const stage = useRef<StageApi | null>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const record = useCallback((t: Telemetry) => setAudit((a) => [...a, t]), []);

  const activeIndex = Math.max(
    0,
    beats.findIndex((b) => b.id === activeId),
  );
  const active = beats[activeIndex];

  const updateText = (text: string) =>
    setBeats((bs) => bs.map((b, i) => (i === activeIndex ? { ...b, text } : b)));

  const addBeat = () => {
    if (beats.length >= MAX_BEATS) return;
    const nb = { id: uid(), text: "" };
    setBeats((bs) => [...bs, nb]);
    setActiveId(nb.id);
  };

  const removeBeat = () => {
    if (beats.length <= 1) return;
    setBeats((bs) => bs.filter((_, i) => i !== activeIndex));
    setActiveId(beats[Math.max(0, activeIndex - 1)].id);
  };

  const onRewrite = async (preset: RewritePreset) => {
    if (!active) return;
    const id = active.id;
    setError(null);
    setRewriting(true);
    try {
      const { text, telemetry } = await rewriteBeat(active, preset);
      setBeats((bs) => bs.map((b) => (b.id === id ? { ...b, text } : b)));
      record(telemetry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
      setDrawer(true);
    } finally {
      setRewriting(false);
    }
  };

  const onGenerate = async () => {
    setError(null);
    setDrawer(true);
    setLoadingBible(true);
    try {
      const { bible, telemetry } = await buildProductionBible(
        beats.filter((b) => b.text.trim()),
      );
      setBible(bible);
      record(telemetry);
    } catch (e) {
      setError(
        !online
          ? "You're offline. Cloud escalation needs a connection; keep iterating locally."
          : e instanceof Error
            ? e.message
            : "Generation failed",
      );
    } finally {
      setLoadingBible(false);
    }
  };

  const last = audit.length ? audit[audit.length - 1] : null;
  const totals = useMemo(
    () => ({
      saved: audit.reduce((n, t) => n + t.costSavedUsd, 0),
      egress: audit.reduce((n, t) => n + t.egressBytes, 0),
    }),
    [audit],
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0e1417] text-slate-900">
      <SceneStage
        beats={beats}
        apiRef={stage}
        onActive={setActiveId}
        onFocusChange={setFocused}
      />

      {/* Train-window frame: dark surround with a metal rim and glass sheen */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div
          className="absolute inset-[10px] rounded-[26px] md:inset-5 md:rounded-[46px]"
          style={{
            boxShadow:
              "inset 0 0 0 2px rgba(255,255,255,0.22), inset 0 0 70px rgba(0,0,0,0.35), 0 0 0 6px #4d5c62, 0 0 0 7px #1d2a30, 0 0 0 9999px #0e1417",
          }}
        />
        <div
          className="absolute inset-[10px] rounded-[26px] md:inset-5 md:rounded-[46px]"
          style={{
            background:
              "linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.08) 100%)",
          }}
        />
      </div>

      <TelemetryHUD
        online={online}
        last={last}
        totalSavedUsd={totals.saved}
        totalEgressBytes={totals.egress}
        busy={rewriting || loadingBible}
        hasBible={!!bible}
        onOpenBible={() => setDrawer(true)}
      />

      {/* Hero copy, only while walking at the start of the passage */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-[24%] z-20 px-8 text-center transition-opacity duration-500 md:top-[22%] ${
          !focused && activeIndex === 0 ? "opacity-100" : "opacity-0"
        }`}
      >
        <h1 className="text-4xl font-light leading-[1.05] tracking-tight text-[#1c2d3f] md:text-7xl">
          Direct every beat,
          <br />
          locally first.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-slate-800/80 md:text-base">
          Rewrite beats on-device at zero cost. Escalate the final timeline to the
          cloud for a full Production Bible.
        </p>
      </div>

      <p className="pointer-events-none absolute right-12 top-1/2 z-20 hidden -translate-y-1/2 text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-white/80 drop-shadow md:block">
        {focused ? (
          <>
            Esc or click away
            <br />
            to step back
          </>
        ) : (
          <>
            Scroll or drag to walk
            <br />
            Click a frame to look closer
          </>
        )}
      </p>

      <div className="absolute inset-x-4 bottom-5 z-30 md:inset-x-auto md:bottom-9 md:left-1/2 md:w-[660px] md:-translate-x-1/2">
        <BeatEditor
          beat={active}
          index={activeIndex}
          total={beats.length}
          rewriting={rewriting}
          escalating={loadingBible}
          canAdd={beats.length < MAX_BEATS}
          canRemove={beats.length > 1}
          canEscalate={online && beats.some((b) => b.text.trim())}
          onChange={updateText}
          onRewrite={onRewrite}
          onAdd={addBeat}
          onRemove={removeBeat}
          onPrev={() => stage.current?.step(-1)}
          onNext={() => stage.current?.step(1)}
          onEscalate={onGenerate}
        />
        {!focused && (
          <button
            onClick={() => stage.current?.focusActive()}
            className="pointer-events-auto mx-auto mt-2 block rounded-full bg-black/45 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white backdrop-blur"
          >
            Look closer
          </button>
        )}
      </div>

      {/* Production Bible drawer */}
      <aside
        className={`absolute inset-y-0 right-0 z-40 w-[min(94vw,540px)] overflow-y-auto border-l border-white/10 bg-zinc-950/90 p-4 text-zinc-100 backdrop-blur-xl transition-transform duration-300 ${
          drawer ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          onClick={() => setDrawer(false)}
          aria-label="Close"
          className="mb-3 ml-auto grid h-8 w-8 place-items-center rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
        <ProductionBible
          bible={bible}
          loading={loadingBible}
          error={error}
          audit={audit}
          canGenerate={online && beats.some((b) => b.text.trim())}
          onGenerate={onGenerate}
        />
      </aside>
    </div>
  );
}
