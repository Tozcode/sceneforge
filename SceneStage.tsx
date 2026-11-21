import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Beat } from "../lib/types";

export interface StageApi {
  step: (d: 1 | -1) => void;
  unfocus: () => void;
  focusActive: () => void;
}

interface Props {
  beats: Beat[];
  onActive: (id: string | null) => void;
  onFocusChange: (focused: boolean) => void;
  apiRef: { current: StageApi | null };
}

/* ------------------------------------------------------------------ */
/* Layout constants (metres; the ring's centre is the origin)          */
/* ------------------------------------------------------------------ */

const RW = 18; // wall radius
const PY = 1.95; // frame centre height
const FW = 3.2; // frame width
const FH = 1.8; // frame height (16:9)
const STEP = 0.3; // angular spacing between beats (rad)
const D = 0.2; // walk offset so beat 0 sits just ahead on the right
const GLIDE_S = 0.95;

type Pose = { th: number; r: number; yaw: number; y: number; pitch: number };

const isSmall = () =>
  window.innerWidth < 820 || window.innerHeight > window.innerWidth;

const walkPose = (th: number): Pose =>
  isSmall()
    ? { th, r: 15.4, yaw: -0.42, y: 1.9, pitch: -0.1 }
    : { th, r: 15.6, yaw: -0.3, y: 1.92, pitch: -0.12 };

const focusPose = (th: number): Pose =>
  isSmall()
    ? { th, r: RW - 5.6, yaw: Math.PI / 2, y: PY - 0.1, pitch: -0.2 }
    : { th, r: RW - 3.8, yaw: Math.PI / 2, y: PY - 0.1, pitch: -0.14 };

const beatAngle = (i: number) => -i * STEP;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function applyPose(cam: THREE.PerspectiveCamera, p: Pose) {
  const c = Math.cos(p.th);
  const s = Math.sin(p.th);
  cam.position.set(p.r * c, p.y, p.r * s);
  // forward tangent = (sin th, 0, -cos th); outward normal = (cos th, 0, sin th)
  const dx = Math.cos(p.yaw) * s + Math.sin(p.yaw) * c;
  const dz = Math.cos(p.yaw) * -c + Math.sin(p.yaw) * s;
  cam.lookAt(cam.position.x + dx, p.y + p.pitch, cam.position.z + dz);
}

/* ------------------------------------------------------------------ */
/* Texture helpers                                                     */
/* ------------------------------------------------------------------ */

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function linearTex(w: number, h: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  return finish(c);
}

function radialTex(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return finish(c);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lh);
      n++;
      line = words[i];
      if (n >= maxLines - 1) {
        const rest = words.slice(i).join(" ");
        let t = rest;
        while (ctx.measureText(`${t}…`).width > maxW && t.length > 1) t = t.slice(0, -1);
        ctx.fillText(t.length < rest.length ? `${t}…` : t, x, y + n * lh);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}

function drawCard(
  canvas: HTMLCanvasElement,
  idx: number,
  total: number,
  text: string,
) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1d2a30";
  ctx.fillRect(0, 0, W, 12);
  ctx.fillStyle = "#b7791f";
  ctx.font = '500 34px ui-monospace, Menlo, monospace';
  ctx.fillText(`BEAT ${String(idx + 1).padStart(2, "0")}`, 56, 92);
  ctx.fillStyle = "#1d2a30";
  ctx.font = '500 54px Georgia, "Times New Roman", serif';
  wrapText(ctx, text.trim() || "Empty beat. Select it and describe the shot.", 56, 190, W - 112, 70, 5);
  ctx.fillStyle = "rgba(29,42,48,0.5)";
  ctx.font = '400 26px ui-monospace, Menlo, monospace';
  ctx.fillText(`SCENEFORGE  ·  ${idx + 1}/${total}`, 56, H - 40);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Entry {
  group: THREE.Group;
  card: THREE.Mesh;
  frameMat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  drawn: string;
}

interface Glide {
  from: Pose;
  to: Pose;
  t: number;
  endMode: "walk" | "focus";
  endTarget: number;
}

export default function SceneStage({ beats, onActive, onFocusChange, apiRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const beatsRef = useRef(beats);
  const cbRef = useRef({ onActive, onFocusChange });
  const syncRef = useRef<((b: Beat[]) => void) | null>(null);

  useEffect(() => {
    cbRef.current = { onActive, onFocusChange };
  }, [onActive, onFocusChange]);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const dom = renderer.domElement;
    dom.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
    host.appendChild(dom);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dbe8f2");
    scene.fog = new THREE.Fog("#dbe8f2", 16, 78);

    const camera = new THREE.PerspectiveCamera(56, 1, 0.05, 100);

    /* ---- environment: sky, meadow, path, mountains, clouds ---- */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(70, 32, 16),
      new THREE.MeshBasicMaterial({
        map: linearTex(4, 256, [
          [0, "#5f9be0"],
          [0.3, "#8fbcec"],
          [0.5, "#dbe9f4"],
          [1, "#dbe9f4"],
        ]),
        side: THREE.BackSide,
        fog: false,
      }),
    );
    scene.add(sky);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(70, 64),
      new THREE.MeshBasicMaterial({
        map: radialTex(512, [
          [0, "#98bb70"],
          [0.6, "#a8c682"],
          [1, "#c2d6a5"],
        ]),
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const path = new THREE.Mesh(
      new THREE.RingGeometry(13.4, 17.4, 128),
      new THREE.MeshBasicMaterial({ color: "#d9ceb4" }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.01;
    scene.add(path);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
      const rad = 48 + Math.random() * 8;
      const h = 7 + Math.random() * 8;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(9 + Math.random() * 6, h, 5),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color("#7f95b0").lerp(new THREE.Color("#a9bdd2"), Math.random()),
        }),
      );
      m.position.set(Math.cos(a) * rad, h / 2, Math.sin(a) * rad);
      scene.add(m);
    }

    const clouds = new THREE.Group();
    const cloudTex = radialTex(128, [
      [0, "rgba(255,255,255,0.95)"],
      [0.5, "rgba(255,255,255,0.55)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = 34 + Math.random() * 26;
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }),
      );
      sp.scale.set(12 + Math.random() * 8, 5 + Math.random() * 3, 1);
      sp.position.set(Math.cos(a) * rad, 12 + Math.random() * 12, Math.sin(a) * rad);
      clouds.add(sp);
    }
    scene.add(clouds);

    /* ---- beats ---- */
    const beatGroup = new THREE.Group();
    scene.add(beatGroup);
    const entries = new Map<string, Entry>();
    let cards: THREE.Mesh[] = [];
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const shadowTex = radialTex(128, [
      [0, "rgba(40,50,30,0.35)"],
      [0.55, "rgba(40,50,30,0.15)"],
      [1, "rgba(40,50,30,0)"],
    ]);

    const st = {
      th: D,
      target: D,
      mode: "walk" as "walk" | "focus",
      focusIdx: 0,
      glide: null as Glide | null,
      pose: walkPose(D),
      active: -2,
      n: 0,
    };
    const minTh = () => D - Math.max(st.n - 1, 0) * STEP;
    const clampTh = (v: number) => Math.min(D, Math.max(minTh(), v));

    function createEntry(): Entry {
      const group = new THREE.Group();
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(FW * 1.3, FH * 1.45),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
      );
      shadow.position.set(0.08, PY - 0.12, 0.01);
      const frameMat = new THREE.MeshBasicMaterial({ color: "#26343a" });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(FW + 0.18, FH + 0.18, 0.08), frameMat);
      frame.position.set(0, PY, 0.05);
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 576;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(FW, FH),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      card.position.set(0, PY, 0.095);
      group.add(shadow, frame, card);
      return { group, card, frameMat, tex, canvas, drawn: "" };
    }

    function syncBeats(list: Beat[]) {
      const keep = new Set(list.map((b) => b.id));
      for (const [id, e] of entries) {
        if (!keep.has(id)) {
          beatGroup.remove(e.group);
          e.group.traverse((o) => {
            const m = o as THREE.Mesh;
            m.geometry?.dispose();
            (m.material as THREE.Material | undefined)?.dispose();
          });
          e.tex.dispose();
          entries.delete(id);
        }
      }
      list.forEach((b, i) => {
        let e = entries.get(b.id);
        if (!e) {
          e = createEntry();
          entries.set(b.id, e);
          beatGroup.add(e.group);
        }
        const a = beatAngle(i);
        e.group.position.set(Math.cos(a) * (RW - 0.02), 0, Math.sin(a) * (RW - 0.02));
        e.group.lookAt(0, 0, 0);
        e.card.userData.idx = i;
        const sig = `${i}/${list.length}:${b.text}`;
        if (e.drawn !== sig) {
          drawCard(e.canvas, i, list.length, b.text);
          e.tex.needsUpdate = true;
          e.drawn = sig;
        }
      });
      cards = list.map((b) => entries.get(b.id)!.card);
      st.n = list.length;
      if (st.focusIdx > st.n - 1) st.focusIdx = Math.max(st.n - 1, 0);
      st.target = clampTh(st.target);
      st.th = clampTh(st.th);
      st.active = -2;
    }
    syncRef.current = syncBeats;
    syncBeats(beatsRef.current);

    /* ---- camera control ---- */
    function startGlide(to: Pose, endMode: "walk" | "focus", endTarget = st.target) {
      st.glide = { from: { ...st.pose }, to, t: 0, endMode, endTarget };
    }

    function focusOn(idx: number) {
      if (idx < 0 || idx > st.n - 1) return;
      const wasWalk = st.mode === "walk";
      st.focusIdx = idx;
      st.mode = "focus";
      startGlide(focusPose(beatAngle(idx)), "focus");
      if (wasWalk) cbRef.current.onFocusChange(true);
    }

    function unfocus() {
      if (st.mode !== "focus" || st.glide) return;
      const t = clampTh(beatAngle(st.focusIdx) + D);
      st.mode = "walk";
      startGlide(walkPose(t), "walk", t);
      cbRef.current.onFocusChange(false);
    }

    function step(d: 1 | -1) {
      if (st.glide) return;
      if (st.mode === "focus") {
        const ni = st.focusIdx + d;
        if (ni >= 0 && ni <= st.n - 1) focusOn(ni);
        return;
      }
      st.target = clampTh((Math.round((st.target - D) / STEP) - d) * STEP + D);
    }

    apiRef.current = {
      step,
      unfocus,
      focusActive: () => {
        if (st.mode === "walk" && !st.glide && st.n > 0) focusOn(Math.max(st.active, 0));
      },
    };

    /* ---- input ---- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(cards, false)[0];
      return hit ? (hit.object.userData.idx as number) : -1;
    };

    let down: { x: number; y: number; start: number } | null = null;
    let dragged = false;

    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, start: st.target };
      dragged = false;
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!down) {
        dom.style.cursor = pick(e) >= 0 ? "pointer" : "grab";
        return;
      }
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!dragged && Math.hypot(dx, dy) > 6) {
        dragged = true;
        dom.style.cursor = "grabbing";
        if (st.mode === "focus") {
          unfocus();
          down = null;
          return;
        }
      }
      if (dragged && st.mode === "walk" && !st.glide) {
        const k = isSmall() ? 0.0042 : 0.0022;
        st.target = clampTh(down.start + (Math.abs(dx) > Math.abs(dy) ? dx : dy) * k);
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = down && !dragged;
      down = null;
      dom.style.cursor = "grab";
      if (!wasClick || st.glide) return;
      const idx = pick(e);
      if (idx >= 0) {
        if (st.mode === "focus" && idx === st.focusIdx) return;
        focusOn(idx);
      } else if (st.mode === "focus") {
        unfocus();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (st.glide) return;
      if (st.mode === "focus") {
        unfocus();
        return;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      st.target = clampTh(st.target - dy * 0.0016);
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && /^(INPUT|TEXTAREA)$/.test(el.tagName);
      if (e.key === "Escape") unfocus();
      else if (typing) return;
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);

    /* ---- resize ---- */
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w >= h ? 56 : 70;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    /* ---- loop ---- */
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      let pose: Pose;
      const g = st.glide;
      if (g) {
        g.t = Math.min(g.t + dt / GLIDE_S, 1);
        const t = g.t;
        const e4 = 1 - Math.pow(1 - t, 4); // th: quartic out (travel leads)
        const e2 = 1 - Math.pow(1 - t, 2); // yaw: quadratic out (turn lags)
        const e3 = 1 - Math.pow(1 - t, 3); // r, y, pitch: cubic out
        pose = {
          th: lerp(g.from.th, g.to.th, e4),
          yaw: lerp(g.from.yaw, g.to.yaw, e2),
          r: lerp(g.from.r, g.to.r, e3),
          y: lerp(g.from.y, g.to.y, e3),
          pitch: lerp(g.from.pitch, g.to.pitch, e3),
        };
        if (t >= 1) {
          st.glide = null;
          if (g.endMode === "walk") {
            st.th = g.endTarget;
            st.target = g.endTarget;
          }
        }
      } else if (st.mode === "walk") {
        st.th += (st.target - st.th) * (1 - Math.exp(-dt / 0.36));
        pose = walkPose(st.th);
      } else {
        pose = focusPose(beatAngle(st.focusIdx));
      }
      st.pose = pose;
      applyPose(camera, pose);

      const idx =
        st.n === 0
          ? -1
          : st.mode === "focus"
            ? st.focusIdx
            : Math.min(st.n - 1, Math.max(0, Math.round((D - st.th) / STEP)));
      if (idx !== st.active) {
        st.active = idx;
        const list = beatsRef.current;
        list.forEach((b, i) => {
          entries.get(b.id)?.frameMat.color.set(i === idx ? "#d89b2b" : "#26343a");
        });
        cbRef.current.onActive(list[idx]?.id ?? null);
      }

      clouds.rotation.y += dt * 0.008;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      apiRef.current = null;
      syncRef.current = null;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      host.removeChild(dom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    beatsRef.current = beats;
    syncRef.current?.(beats);
  }, [beats]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
