<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Pause, Play } from 'lucide-vue-next';
import { useAppState } from '@/stores/appState';

interface PeerNode {
  id: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  speed: number;
  glow: number;
  bornAt: number;
}

interface PeerEdge {
  a: number;
  b: number;
  strength: number;
  target: number;
  curveSign: number;
  createdAt: number;
}

interface KnowledgePulse {
  from: number;
  to: number;
  progress: number;
  speed: number;
  curveSign: number;
}

interface ArrivalRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

const { state, t } = useAppState();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const prefersReducedMotion = ref(false);
const userPaused = ref(false);

let width = 880;
let height = 340;
let dpr = 1;
let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let lastFrameTime = 0;
let elapsed = 0;
let nextEdgeAttempt = 0.6;
let nextPulseAttempt = 1.4;
let nextNodeId = 1;

let nodes: PeerNode[] = [];
let edges: PeerEdge[] = [];
let pulses: KnowledgePulse[] = [];
let ripples: ArrivalRipple[] = [];

const pointer = {
  active: false,
  x: 0,
  y: 0,
};

function isAnimationRunning(): boolean {
  return !prefersReducedMotion.value && !userPaused.value;
}

function getPalette() {
  if (state.theme === 'dark') {
    return {
      nodeCore: 'rgba(237, 237, 235, 0.78)',
      nodeActive: 'rgba(45, 212, 191, 0.95)',
      nodeHalo: 'rgba(45, 212, 191, 0.22)',
      edge: [237, 237, 235] as const,
      edgeAccent: [45, 212, 191] as const,
      pulse: 'rgba(45, 212, 191, 0.92)',
      pulseGlow: 'rgba(45, 212, 191, 0.24)',
      ripple: [45, 212, 191] as const,
      dotGrid: 'rgba(237, 237, 235, 0.045)',
    };
  }
  return {
    nodeCore: 'rgba(17, 17, 16, 0.74)',
    nodeActive: 'rgba(15, 118, 110, 0.96)',
    nodeHalo: 'rgba(15, 118, 110, 0.16)',
    edge: [17, 17, 16] as const,
    edgeAccent: [15, 118, 110] as const,
    pulse: 'rgba(15, 118, 110, 0.92)',
    pulseGlow: 'rgba(15, 118, 110, 0.18)',
    ripple: [15, 118, 110] as const,
    dotGrid: 'rgba(17, 17, 16, 0.055)',
  };
}

/**
 * Seed peer nodes with relaxed spatial distribution and no central hub.
 */
function seedNodes(w: number, h: number) {
  const count = w < 520 ? 15 : w < 780 ? 20 : 24;
  const padX = Math.max(36, w * 0.07);
  const padY = Math.max(34, h * 0.14);
  const usableW = Math.max(120, w - padX * 2);
  const usableH = Math.max(100, h - padY * 2);

  // Stratified organic placement so every region breathes evenly with zero central cluster
  const cols = w < 520 ? 5 : 6;
  const rows = Math.ceil(count / cols);
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  const seeded: PeerNode[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Deterministic harmonic jitter so initial composition always feels balanced
    const jx = (Math.sin(i * 12.9898 + 1.3) * 0.5 + 0.5) * 0.68 + 0.16;
    const jy = (Math.cos(i * 7.1234 + 2.7) * 0.5 + 0.5) * 0.68 + 0.16;
    const x = padX + (col + jx) * cellW;
    const y = padY + (row + jy) * cellH;
    seeded.push({
      id: nextNodeId++,
      x,
      y,
      homeX: x,
      homeY: y,
      vx: 0,
      vy: 0,
      radius: 2.6 + ((i * 7) % 5) * 0.22,
      phase: i * 0.91,
      speed: 0.22 + ((i * 13) % 7) * 0.032,
      glow: 0,
      bornAt: 0,
    });
  }

  nodes = seeded;
  edges = [];
  pulses = [];
  ripples = [];
  elapsed = 0;

  if (prefersReducedMotion.value) {
    // Build a serene, balanced static peer graph immediately
    seedBalancedEdges(Math.floor(nodes.length * 1.15), 1);
  } else {
    // Begin with only a few nascent peer links so visitors watch connections organically emerge
    seedBalancedEdges(4, 0.35);
    nextEdgeAttempt = 0.55;
    nextPulseAttempt = 1.25;
  }
}

function nodeDegree(nodeId: number): number {
  let deg = 0;
  for (const e of edges) {
    if (e.target > 0 && (e.a === nodeId || e.b === nodeId)) deg++;
  }
  return deg;
}

function hasEdge(a: number, b: number): boolean {
  return edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

function findNode(id: number): PeerNode | undefined {
  return nodes.find((n) => n.id === id);
}

function maxEdgeDistance(): number {
  return Math.min(220, Math.max(135, width * 0.23));
}

function seedBalancedEdges(desiredCount: number, initialStrength: number) {
  const maxDist = maxEdgeDistance();
  const maxDeg = 3; // Strict low degree ceiling guarantees no central hub can ever form

  for (let attempt = 0; attempt < desiredCount * 5 && edges.length < desiredCount; attempt++) {
    const idx = (attempt * 5 + Math.floor(attempt / 3)) % nodes.length;
    const a = nodes[idx];
    if (!a || nodeDegree(a.id) >= maxDeg) continue;

    let best: PeerNode | null = null;
    let bestDist = Infinity;

    for (const b of nodes) {
      if (b.id === a.id || hasEdge(a.id, b.id) || nodeDegree(b.id) >= maxDeg) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 34 && dist < maxDist && dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }

    if (best) {
      edges.push({
        a: a.id,
        b: best.id,
        strength: initialStrength,
        target: 1,
        curveSign: ((a.id + best.id) % 2 === 0 ? 1 : -1) * (0.07 + ((a.id * 3) % 5) * 0.014),
        createdAt: elapsed,
      });
    }
  }
}

function tryGrowEdge(preferNearPoint?: { x: number; y: number }): PeerEdge | null {
  const maxDist = maxEdgeDistance();
  const maxEdges = Math.floor(nodes.length * 1.25);
  const activeEdges = edges.filter((e) => e.target > 0);
  if (activeEdges.length >= maxEdges) return null;

  const maxDeg = 3;
  // Prioritize peers with low degree (0 or 1) so isolated nodes organically join the mesh
  const candidates = nodes
    .filter((n) => nodeDegree(n.id) < maxDeg)
    .sort((u, v) => {
      const degDiff = nodeDegree(u.id) - nodeDegree(v.id);
      if (preferNearPoint) {
        const du = Math.hypot(u.x - preferNearPoint.x, u.y - preferNearPoint.y);
        const dv = Math.hypot(v.x - preferNearPoint.x, v.y - preferNearPoint.y);
        return du - dv + degDiff * 45;
      }
      return degDiff + (Math.random() - 0.5) * 1.4;
    });

  for (const a of candidates) {
    const neighbors = nodes
      .filter((b) => {
        if (b.id === a.id || hasEdge(a.id, b.id) || nodeDegree(b.id) >= maxDeg) return false;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        return d > 30 && d < maxDist;
      })
      .sort((u, v) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(a.x - v.x, a.y - v.y));

    const chosen = neighbors[0];
    if (chosen) {
      const created: PeerEdge = {
        a: a.id,
        b: chosen.id,
        strength: 0.01,
        target: 1,
        curveSign: ((a.id + chosen.id) % 2 === 0 ? 1 : -1) * (0.07 + ((a.id * 5) % 4) * 0.018),
        createdAt: elapsed,
      };
      edges.push(created);
      return created;
    }
  }
  return null;
}

function spawnPulse(fromId?: number, avoidId?: number) {
  const matureEdges = edges.filter((e) => e.strength > 0.45 && e.target > 0);
  if (matureEdges.length === 0 || pulses.length >= 6) return;

  let chosen: PeerEdge | undefined;
  let forward = true;

  if (fromId !== undefined) {
    const incident = matureEdges.filter((e) => {
      if (e.a === fromId && e.b !== avoidId) return true;
      if (e.b === fromId && e.a !== avoidId) return true;
      return false;
    });
    if (incident.length === 0) return;
    chosen = incident[Math.floor(Math.random() * incident.length)];
    if (!chosen) return;
    forward = chosen.a === fromId;
  } else {
    chosen = matureEdges[Math.floor(Math.random() * matureEdges.length)];
    if (!chosen) return;
    forward = Math.random() > 0.5;
  }

  pulses.push({
    from: forward ? chosen.a : chosen.b,
    to: forward ? chosen.b : chosen.a,
    progress: 0,
    speed: 0.34 + Math.random() * 0.16,
    curveSign: forward ? chosen.curveSign : -chosen.curveSign,
  });
}

function pointOnQuadratic(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  curveSign: number,
  tVal: number
) {
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const dx = bx - ax;
  const dy = by - ay;
  const cx = mx - dy * curveSign;
  const cy = my + dx * curveSign;

  const inv = 1 - tVal;
  return {
    x: inv * inv * ax + 2 * inv * tVal * cx + tVal * tVal * bx,
    y: inv * inv * ay + 2 * inv * tVal * cy + tVal * tVal * by,
    cx,
    cy,
  };
}

function updateSimulation(dt: number) {
  elapsed += dt;
  const pad = 26;

  // 1. Gentle organic drift around each peer's natural neighborhood
  for (const n of nodes) {
    const targetX =
      n.homeX + Math.sin(elapsed * n.speed + n.phase) * 14 + Math.cos(elapsed * n.speed * 0.6 + n.phase * 1.3) * 8;
    const targetY =
      n.homeY + Math.cos(elapsed * n.speed * 0.85 + n.phase * 0.7) * 11 + Math.sin(elapsed * n.speed * 0.45 + n.phase) * 6;

    // Soft spring toward organic trajectory
    n.vx += (targetX - n.x) * dt * 0.9;
    n.vy += (targetY - n.y) * dt * 0.9;

    // Gentle peer-to-peer personal space (keeps graph uncluttered)
    for (const other of nodes) {
      if (other.id === n.id) continue;
      const dx = n.x - other.x;
      const dy = n.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.1 && d < 52) {
        const push = ((52 - d) / 52) * 18 * dt;
        n.vx += (dx / d) * push;
        n.vy += (dy / d) * push;
      }
    }

    // Subtle pointer awareness: illuminate and gently orient nearby peers without chaotic scatter
    if (pointer.active) {
      const dx = pointer.x - n.x;
      const dy = pointer.y - n.y;
      const d = Math.hypot(dx, dy);
      if (d < 135 && d > 28) {
        n.glow = Math.max(n.glow, (1 - d / 135) * 0.55);
      }
    }

    n.vx *= Math.pow(0.2, dt);
    n.vy *= Math.pow(0.2, dt);
    n.x = Math.min(width - pad, Math.max(pad, n.x + n.vx * dt));
    n.y = Math.min(height - pad, Math.max(pad, n.y + n.vy * dt));
    n.glow = Math.max(0, n.glow - dt * 0.65);
  }

  // 2. Organic connection growth and gentle natural turnover
  if (elapsed >= nextEdgeAttempt) {
    const grew = tryGrowEdge(pointer.active ? { x: pointer.x, y: pointer.y } : undefined);
    if (!grew && edges.length > nodes.length * 0.9) {
      // Gently let one older edge fade so the network keeps breathing and reshaping
      const oldest = edges.find((e) => e.target > 0 && elapsed - e.createdAt > 11);
      if (oldest) oldest.target = 0;
    }
    const activeCount = edges.filter((e) => e.target > 0).length;
    nextEdgeAttempt = elapsed + (activeCount < nodes.length * 0.85 ? 0.55 : 2.1);
  }

  const maxDist = maxEdgeDistance() * 1.18;
  for (let i = edges.length - 1; i >= 0; i--) {
    const e = edges[i];
    if (!e) continue;
    const a = findNode(e.a);
    const b = findNode(e.b);
    if (!a || !b) {
      edges.splice(i, 1);
      continue;
    }
    if (Math.hypot(a.x - b.x, a.y - b.y) > maxDist) {
      e.target = 0;
    }
    const rate = e.target > e.strength ? 0.55 : 0.35;
    e.strength += (e.target - e.strength) * Math.min(1, dt * rate * 2.4);
    if (e.target === 0 && e.strength < 0.02) {
      edges.splice(i, 1);
    }
  }

  // 3. Peer-to-peer knowledge exchange pulses
  if (elapsed >= nextPulseAttempt) {
    spawnPulse();
    nextPulseAttempt = elapsed + 1.35 + Math.random() * 1.1;
  }

  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    if (!p) continue;
    p.progress += p.speed * dt;
    if (p.progress >= 1) {
      const targetNode = findNode(p.to);
      if (targetNode) {
        targetNode.glow = 1;
        ripples.push({
          x: targetNode.x,
          y: targetNode.y,
          radius: targetNode.radius + 2,
          maxRadius: 20,
          alpha: 0.45,
        });
        // Decentralized relay: receiving peer occasionally relays insight onward
        if (Math.random() < 0.42 && pulses.length < 5) {
          spawnPulse(targetNode.id, p.from);
        }
      }
      pulses.splice(i, 1);
    }
  }

  // 4. Expanding arrival ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    if (!r) continue;
    r.radius += dt * 22;
    r.alpha -= dt * 0.42;
    if (r.alpha <= 0.01 || r.radius >= r.maxRadius) {
      ripples.splice(i, 1);
    }
  }
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = getPalette();

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Subtle archival reference dots (whisper-quiet graph paper feel)
  const step = 36;
  ctx.fillStyle = palette.dotGrid;
  for (let x = step * 0.5; x < width; x += step) {
    for (let y = step * 0.5; y < height; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Edges (graceful hairline quadratic curves)
  for (const e of edges) {
    const a = findNode(e.a);
    const b = findNode(e.b);
    if (!a || !b || e.strength <= 0.01) continue;

    const pt = pointOnQuadratic(a.x, a.y, b.x, b.y, e.curveSign, 0.5);
    const hoverBoost =
      pointer.active &&
      (Math.hypot(a.x - pointer.x, a.y - pointer.y) < 130 ||
        Math.hypot(b.x - pointer.x, b.y - pointer.y) < 130)
        ? 1
        : 0;
    const glowBoost = Math.max(a.glow, b.glow);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(pt.cx, pt.cy, b.x, b.y);

    if (hoverBoost > 0 || glowBoost > 0.35) {
      const alpha = e.strength * (0.16 + Math.max(hoverBoost * 0.22, glowBoost * 0.24));
      ctx.strokeStyle = `rgba(${palette.edgeAccent[0]}, ${palette.edgeAccent[1]}, ${palette.edgeAccent[2]}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.1;
    } else {
      const alpha = e.strength * 0.16;
      ctx.strokeStyle = `rgba(${palette.edge[0]}, ${palette.edge[1]}, ${palette.edge[2]}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.9;
    }
    ctx.stroke();
  }

  // Arrival ripples
  for (const r of ripples) {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${palette.ripple[0]}, ${palette.ripple[1]}, ${palette.ripple[2]}, ${Math.max(0, r.alpha).toFixed(3)})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  // Knowledge pulses traveling peer-to-peer
  for (const p of pulses) {
    const from = findNode(p.from);
    const to = findNode(p.to);
    if (!from || !to) continue;

    const pos = pointOnQuadratic(from.x, from.y, to.x, to.y, p.curveSign, p.progress);
    // Soft halo
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = palette.pulseGlow;
    ctx.fill();

    // Crisp core
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = palette.pulse;
    ctx.fill();
  }

  // Peer nodes (all equal status — never a central master node)
  for (const n of nodes) {
    if (n.glow > 0.08) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius + 5 * n.glow, 0, Math.PI * 2);
      ctx.fillStyle = palette.nodeHalo;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fillStyle = n.glow > 0.3 ? palette.nodeActive : palette.nodeCore;
    ctx.fill();
  }

  ctx.restore();
}

function tick(now: number) {
  if (!isAnimationRunning()) {
    rafId = null;
    return;
  }
  const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0.016;
  lastFrameTime = now;

  updateSimulation(dt);
  draw();
  rafId = requestAnimationFrame(tick);
}

function startLoop() {
  if (typeof window === 'undefined' || rafId !== null || !isAnimationRunning()) return;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function resizeCanvas() {
  const container = containerRef.value;
  const canvas = canvasRef.value;
  if (!container || !canvas) return;

  const rect = container.getBoundingClientRect();
  const nextW = Math.max(280, Math.floor(rect.width || 880));
  const nextH = nextW < 520 ? 250 : 340;
  const prevW = width;

  width = nextW;
  height = nextH;
  dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (nodes.length === 0 || Math.abs(prevW - nextW) > 120) {
    seedNodes(width, height);
  }
  draw();
}

function getLocalCoords(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function onPointerMove(event: PointerEvent) {
  const pt = getLocalCoords(event);
  if (!pt) return;
  pointer.active = true;
  pointer.x = pt.x;
  pointer.y = pt.y;
}

function onPointerLeave() {
  pointer.active = false;
}

function onCanvasClick(event: PointerEvent) {
  const pt = getLocalCoords(event);
  if (!pt) return;

  const pad = 22;
  const x = Math.min(width - pad, Math.max(pad, pt.x));
  const y = Math.min(height - pad, Math.max(pad, pt.y));

  // Keep node count bounded while letting users seed new peers
  const cap = width < 520 ? 22 : 34;
  if (nodes.length >= cap) {
    const removed = nodes.shift();
    if (removed) {
      edges = edges.filter((e) => e.a !== removed.id && e.b !== removed.id);
      pulses = pulses.filter((p) => p.from !== removed.id && p.to !== removed.id);
    }
  }

  const newNode: PeerNode = {
    id: nextNodeId++,
    x,
    y,
    homeX: x,
    homeY: y,
    vx: 0,
    vy: 0,
    radius: 3.1,
    phase: Math.random() * Math.PI * 2,
    speed: 0.24 + Math.random() * 0.14,
    glow: 0.95,
    bornAt: elapsed,
  };
  nodes.push(newNode);

  // Connect the new peer to up to 2 nearest peers
  const maxDist = maxEdgeDistance() * 1.15;
  const nearest = nodes
    .filter((n) => n.id !== newNode.id && nodeDegree(n.id) < 3)
    .map((n) => ({ node: n, dist: Math.hypot(n.x - x, n.y - y) }))
    .filter((item) => item.dist < maxDist)
    .sort((u, v) => u.dist - v.dist)
    .slice(0, 2);

  for (const item of nearest) {
    const edge: PeerEdge = {
      a: newNode.id,
      b: item.node.id,
      strength: prefersReducedMotion.value ? 1 : 0.15,
      target: 1,
      curveSign: ((newNode.id + item.node.id) % 2 === 0 ? 1 : -1) * 0.09,
      createdAt: elapsed,
    };
    edges.push(edge);
    if (isAnimationRunning()) {
      pulses.push({
        from: newNode.id,
        to: item.node.id,
        progress: 0,
        speed: 0.42,
        curveSign: edge.curveSign,
      });
    }
  }

  if (isAnimationRunning()) {
    ripples.push({
      x,
      y,
      radius: 4,
      maxRadius: 24,
      alpha: 0.5,
    });
  } else {
    draw();
  }
}

function togglePause() {
  userPaused.value = !userPaused.value;
  if (isAnimationRunning()) {
    startLoop();
  } else {
    stopLoop();
    draw();
  }
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    stopLoop();
  } else if (isAnimationRunning()) {
    startLoop();
  }
}

function handleMotionChange(e: MediaQueryListEvent) {
  prefersReducedMotion.value = e.matches;
  if (e.matches) {
    stopLoop();
    if (edges.length < nodes.length * 0.8) {
      seedBalancedEdges(Math.floor(nodes.length * 1.1), 1);
    }
    draw();
  } else if (!userPaused.value) {
    startLoop();
  }
}

watch(
  () => state.theme,
  () => {
    draw();
  }
);

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.value = motionQuery.matches;
    motionQuery.addEventListener?.('change', handleMotionChange);
  }

  resizeCanvas();

  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(containerRef.value);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (isAnimationRunning()) {
    startLoop();
  }
});

onBeforeUnmount(() => {
  stopLoop();
  resizeObserver?.disconnect();
  motionQuery?.removeEventListener?.('change', handleMotionChange);
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
});
</script>

<template>
  <figure class="space-y-3">
    <div
      ref="containerRef"
      class="relative w-full overflow-hidden border-y border-border-light bg-paper dark:border-border-dark dark:bg-obsidian"
    >
      <canvas
        ref="canvasRef"
        role="img"
        :aria-label="t.about.hero.visualAriaLabel"
        class="block w-full cursor-crosshair touch-manipulation"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @pointerdown="onCanvasClick"
      />
    </div>

    <figcaption
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-[11px] leading-relaxed text-ink-faint dark:text-chalk-faint"
    >
      <span>{{ t.about.hero.visualCaption }}</span>

      <div class="flex items-center gap-3">
        <span class="hidden sm:inline">{{ t.about.hero.visualHint }}</span>
        <button
          v-if="!prefersReducedMotion"
          type="button"
          class="inline-flex items-center gap-1 rounded border border-border-light px-2 py-0.5 text-[10.5px] text-ink-muted transition hover:border-ink/40 hover:text-ink dark:border-border-dark dark:text-chalk-muted dark:hover:border-chalk/40 dark:hover:text-chalk cursor-pointer"
          :aria-label="userPaused ? t.about.hero.resumeMotion : t.about.hero.pauseMotion"
          @click="togglePause"
        >
          <Play v-if="userPaused" class="h-2.5 w-2.5" />
          <Pause v-else class="h-2.5 w-2.5" />
          <span>{{ userPaused ? t.about.hero.resumeMotion : t.about.hero.pauseMotion }}</span>
        </button>
      </div>
    </figcaption>
  </figure>
</template>
