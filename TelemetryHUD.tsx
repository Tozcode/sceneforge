import { Cpu, Cloud, WifiOff, Wifi, FileText } from "lucide-react";
import type { Telemetry } from "../lib/types";

interface Props {
  online: boolean;
  last: Telemetry | null;
  totalSavedUsd: number;
  totalEgressBytes: number;
  busy: boolean;
  hasBible: boolean;
  onOpenBible: () => void;
}

function fmtBytes(n: number) {
  if (n === 0) return "0 B";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

const glass =
  "border border-white/60 bg-white/25 backdrop-blur-xl shadow-[0_8px_30px_rgba(20,40,60,0.18)]";

export default function TelemetryHUD({
  online,
  last,
  totalSavedUsd,
  totalEgressBytes,
  busy,
  hasBible,
  onOpenBible,
}: Props) {
  const onDevice = last?.source === "ON_DEVICE";

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-6 pt-5 md:px-12 md:pt-8">
      <div className="flex items-center justify-between">
        <div className="pointer-events-auto flex items-center gap-2 text-[15px] font-medium text-white drop-shadow">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-400 text-xs font-bold text-zinc-900">
            S
          </span>
          SceneForge
        </div>

        <div
          className={`pointer-events-auto hidden items-center gap-5 rounded-full px-5 py-2 text-xs text-slate-800 md:flex ${glass}`}
        >
          <Stats
            last={last}
            onDevice={onDevice}
            busy={busy}
            totalEgressBytes={totalEgressBytes}
            totalSavedUsd={totalSavedUsd}
          />
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <span
            className={`hidden items-center gap-1.5 text-xs text-white drop-shadow sm:inline-flex ${
              online ? "" : "text-amber-300"
            }`}
          >
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? "Online" : "Offline"}
          </span>
          <button
            onClick={onOpenBible}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-900 ${glass} ${
              hasBible ? "ring-2 ring-amber-400/80" : ""
            }`}
          >
            <FileText size={13} /> Bible
          </button>
        </div>
      </div>

      <div
        className={`pointer-events-auto mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl px-4 py-2 text-[11px] text-slate-800 md:hidden ${glass}`}
      >
        <Stats
          last={last}
          onDevice={onDevice}
          busy={busy}
          totalEgressBytes={totalEgressBytes}
          totalSavedUsd={totalSavedUsd}
        />
      </div>
    </header>
  );
}

function Stats({
  last,
  onDevice,
  busy,
  totalEgressBytes,
  totalSavedUsd,
}: {
  last: Telemetry | null;
  onDevice: boolean;
  busy: boolean;
  totalEgressBytes: number;
  totalSavedUsd: number;
}) {
  return (
    <>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono ${
          !last
            ? "bg-white/50 text-slate-600"
            : onDevice
              ? "bg-emerald-500/25 text-emerald-900"
              : "bg-sky-500/25 text-sky-900"
        } ${busy ? "animate-pulse" : ""}`}
      >
        {onDevice ? <Cpu size={12} /> : <Cloud size={12} />}
        {last ? last.source : "IDLE"}
      </span>
      <span>
        <span className="opacity-60">Latency </span>
        <span className="font-mono">{last ? `${last.latencyMs} ms` : "—"}</span>
      </span>
      <span>
        <span className="opacity-60">Egress </span>
        <span className="font-mono">
          {last ? fmtBytes(last.egressBytes) : "—"}
          <span className="opacity-60"> · {fmtBytes(totalEgressBytes)}</span>
        </span>
      </span>
      <span>
        <span className="opacity-60">Saved </span>
        <span className="font-mono">${totalSavedUsd.toFixed(5)}</span>
      </span>
    </>
  );
}
