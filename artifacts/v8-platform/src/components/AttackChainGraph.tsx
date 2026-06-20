// ---------------------------------------------------------------------------
// Attack Chain Graph Visualization ⭐⭐⭐⭐⭐
// ---------------------------------------------------------------------------
//
// Renders AI-detected attack chains as an interactive SVG graph with a dark
// cyberpunk aesthetic. Supports:
//   - Directed graph with animated edges
//   - Severity-coded nodes (critical=red, high=orange, etc.)
//   - Hover tooltips with node details
//   - Expandable/collapsible chains
//   - Path highlighting on hover
//
// Data format matches the AI Attack Chain Detection engine output.

import { useState, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface AttackChainNode {
  id: string;
  label: string;
  type: "entry" | "exploit" | "impact" | "finding" | "target";
  severity?: "critical" | "high" | "medium" | "low" | "info";
  findingId?: number;
  description?: string;
  cveIds?: string[];
  cweIds?: string[];
}

export interface AttackChainEdge {
  source: string;
  target: string;
  label?: string;
  technique?: string;
}

export interface AttackChain {
  id: string;
  name: string;
  description: string;
  nodes: AttackChainNode[];
  edges: AttackChainEdge[];
  totalRiskScore: number;
}

// ── Color Palette ─────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, { fill: string; stroke: string; text: string; glow: string }> = {
  entry: {
    fill: "#1e1b4b",
    stroke: "#818cf8",
    text: "#c7d2fe",
    glow: "rgba(129, 140, 248, 0.15)",
  },
  exploit: {
    fill: "#1c1917",
    stroke: "#fb923c",
    text: "#fed7aa",
    glow: "rgba(251, 146, 60, 0.15)",
  },
  impact: {
    fill: "#1f1212",
    stroke: "#f87171",
    text: "#fecaca",
    glow: "rgba(248, 113, 113, 0.15)",
  },
  finding: {
    fill: "#0f172a",
    stroke: "#22d3ee",
    text: "#a5f3fc",
    glow: "rgba(34, 211, 238, 0.12)",
  },
  target: {
    fill: "#0a0f1a",
    stroke: "#22c55e",
    text: "#bbf7d0",
    glow: "rgba(34, 197, 94, 0.12)",
  },
};

const SEVERITY_GLOW: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

// ── Layout Engine (Simple Layered) ────────────────────────────────────────

interface LayoutNode extends AttackChainNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeLayout(
  nodes: AttackChainNode[],
  edges: AttackChainEdge[],
  width: number,
): LayoutNode[] {
  if (nodes.length === 0) return [];

  // Build adjacency for topological sort
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const allIds = new Set(nodes.map((n) => n.id));

  for (const n of nodes) {
    if (!children.has(n.id)) children.set(n.id, []);
    if (!parents.has(n.id)) parents.set(n.id, []);
  }

  for (const e of edges) {
    if (allIds.has(e.source) && allIds.has(e.target)) {
      children.get(e.source)?.push(e.target);
      parents.get(e.target)?.push(e.source);
    }
  }

  // Layered layout: entry/exploit/impact/finding in layers
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const layers: string[][] = [];
  const assigned = new Set<string>();

  // Layer 0: entry nodes + target
  const firstLayer = nodes
    .filter((n) => n.type === "target" || n.type === "entry")
    .map((n) => n.id)
    .filter((id) => !assigned.has(id));
  if (firstLayer.length > 0) {
    layers.push(firstLayer);
    for (const id of firstLayer) assigned.add(id);
  }

  // BFS for remaining
  let maxIter = 100;
  while (assigned.size < nodes.length && --maxIter > 0) {
    const nextLayer: string[] = [];
    for (const n of nodes) {
      if (assigned.has(n.id)) continue;
      const deps = parents.get(n.id) ?? [];
      if (deps.length === 0 || deps.every((d) => assigned.has(d))) {
        nextLayer.push(n.id);
      }
    }
    if (nextLayer.length === 0) {
      // Break cycles: add remaining
      for (const n of nodes) {
        if (!assigned.has(n.id)) nextLayer.push(n.id);
      }
    }
    if (nextLayer.length > 0) {
      layers.push(nextLayer);
      for (const id of nextLayer) assigned.add(id);
    }
  }

  // Position nodes
  const nodeW = 140;
  const nodeH = 44;
  const padX = 40;
  const padY = 24;
  const layerGap = 180;

  const layoutNodes: LayoutNode[] = [];

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const totalH = layer.length * (nodeH + padY) - padY;
    const startY = (400 - totalH) / 2;

    for (let ni = 0; ni < layer.length; ni++) {
      const id = layer[ni];
      const node = nodeMap.get(id);
      if (!node) continue;

      const x = li * layerGap + padX;
      const y = startY + ni * (nodeH + padY);

      layoutNodes.push({ ...node, x, y, width: nodeW, height: nodeH });
    }
  }

  return layoutNodes;
}

// ── Component ─────────────────────────────────────────────────────────────

interface AttackChainGraphProps {
  chains: AttackChain[];
  onNodeClick?: (node: AttackChainNode) => void;
  width?: number;
  height?: number;
}

export function AttackChainGraph({
  chains,
  onNodeClick,
  width = 700,
  height = 400,
}: AttackChainGraphProps) {
  const [expandedChain, setExpandedChain] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  if (!chains || chains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 20h16" />
            <path d="M4 4h16" />
            <path d="M4 12h16" />
          </svg>
        </div>
        <p className="text-sm">No attack chains detected</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          AI analysis may reveal chained vulnerability paths
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {chains.map((chain) => (
        <div
          key={chain.id}
          className="rounded-lg border border-border/50 bg-black/30 overflow-hidden"
        >
          {/* Chain Header */}
          <button
            onClick={() =>
              setExpandedChain(expandedChain === chain.id ? null : chain.id)
            }
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    chain.totalRiskScore >= 7
                      ? "#ef4444"
                      : chain.totalRiskScore >= 4
                        ? "#f97316"
                        : "#22c55e",
                  boxShadow: `0 0 6px ${
                    chain.totalRiskScore >= 7
                      ? "rgba(239, 68, 68, 0.5)"
                      : "rgba(34, 197, 94, 0.3)"
                  }`,
                }}
              />
              <span className="text-sm font-medium">{chain.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 bg-muted/30 rounded">
                {chain.nodes.length} nodes · {chain.edges.length} edges
              </span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor:
                    chain.totalRiskScore >= 7
                      ? "rgba(239, 68, 68, 0.15)"
                      : chain.totalRiskScore >= 4
                        ? "rgba(249, 115, 22, 0.15)"
                        : "rgba(34, 197, 94, 0.15)",
                  color:
                    chain.totalRiskScore >= 7
                      ? "#ef4444"
                      : chain.totalRiskScore >= 4
                        ? "#f97316"
                        : "#22c55e",
                }}
              >
                Risk: {chain.totalRiskScore.toFixed(1)}/10
              </span>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${
                expandedChain === chain.id ? "rotate-180" : ""
              }`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Chain Description */}
          {expandedChain === chain.id && chain.description && (
            <div className="px-4 py-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground">{chain.description}</p>
            </div>
          )}

          {/* SVG Graph */}
          {expandedChain === chain.id && (
            <div className="border-t border-border/30 p-2 overflow-auto">
              <ChainSvgGraph
                chain={chain}
                width={width}
                height={height}
                hoveredNode={hoveredNode}
                onHover={setHoveredNode}
                onClick={onNodeClick}
              />
            </div>
          )}

          {/* Node Legend (when expanded) */}
          {expandedChain === chain.id && (
            <div className="flex flex-wrap gap-3 px-4 py-2 border-t border-border/30 bg-muted/10">
              {[
                { type: "entry", label: "Entry Point" },
                { type: "exploit", label: "Exploit" },
                { type: "impact", label: "Impact" },
                { type: "finding", label: "Finding" },
                { type: "target", label: "Target" },
              ].map(({ type, label }) => {
                const colors = NODE_COLORS[type] ?? NODE_COLORS.finding;
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{
                        backgroundColor: colors.fill,
                        border: `1px solid ${colors.stroke}`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Inner SVG Graph ───────────────────────────────────────────────────────

function ChainSvgGraph({
  chain,
  width,
  height,
  hoveredNode,
  onHover,
  onClick,
}: {
  chain: AttackChain;
  width: number;
  height: number;
  hoveredNode: string | null;
  onHover: (id: string | null) => void;
  onClick?: (node: AttackChainNode) => void;
}) {
  const layoutNodes = useMemo(
    () => computeLayout(chain.nodes, chain.edges, width),
    [chain.nodes, chain.edges, width],
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes],
  );

  const svgW = Math.max(width, (chain.nodes.length > 5 ? chain.nodes.length * 60 : width));
  const svgH = Math.max(height, 300);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="bg-black/20 rounded-lg"
      style={{ minHeight: height }}
    >
      {/* Gradient definitions */}
      <defs>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#475569" />
        </marker>
        <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>

      {/* Background grid */}
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
      </pattern>
      <rect width={svgW} height={svgH} fill="url(#grid)" />

      {/* Edges */}
      {chain.edges.map((edge, idx) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;

        const sx = source.x + source.width;
        const sy = source.y + source.height / 2;
        const tx = target.x;
        const ty = target.y + target.height / 2;

        const midX = (sx + tx) / 2;
        const isHovered =
          hoveredNode === edge.source || hoveredNode === edge.target;

        return (
          <g key={`edge-${idx}`}>
            {/* Edge line */}
            <path
              d={`M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`}
              fill="none"
              stroke={isHovered ? "#22d3ee" : "url(#edgeGrad)"}
              strokeWidth={isHovered ? 2 : 1}
              strokeOpacity={isHovered ? 0.8 : 0.4}
              markerEnd="url(#arrowhead)"
              style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
            />
            {/* Edge label */}
            {edge.label && (
              <text
                x={midX}
                y={(sy + ty) / 2 - 4}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                fontFamily="monospace"
              >
                {edge.label}
              </text>
            )}
            {/* Edge technique */}
            {edge.technique && (
              <text
                x={midX}
                y={(sy + ty) / 2 + 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="7"
                fontFamily="monospace"
              >
                {edge.technique}
              </text>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {layoutNodes.map((node) => {
        const colors = NODE_COLORS[node.type] ?? NODE_COLORS.finding;
        const isHovered = hoveredNode === node.id;
        const severityGlow = node.severity
          ? SEVERITY_GLOW[node.severity]
          : null;

        return (
          <g
            key={node.id}
            onMouseEnter={() => onHover(node.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick?.(node)}
            style={{ cursor: onClick ? "pointer" : "default" }}
          >
            {/* Glow effect */}
            {isHovered && (
              <rect
                x={node.x - 4}
                y={node.y - 4}
                width={node.width + 8}
                height={node.height + 8}
                rx="6"
                fill="none"
                stroke={severityGlow ?? colors.stroke}
                strokeWidth="2"
                opacity="0.3"
                filter="url(#nodeGlow)"
              />
            )}

            {/* Node rectangle */}
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx="4"
              fill={colors.fill}
              stroke={
                isHovered
                  ? severityGlow ?? colors.stroke
                  : colors.stroke
              }
              strokeWidth={isHovered ? 2 : 1}
              strokeOpacity={isHovered ? 0.8 : 0.5}
              style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
            />

            {/* Severity indicator line */}
            {node.severity && (
              <rect
                x={node.x + 4}
                y={node.y + 4}
                width="3"
                height={node.height - 8}
                rx="1.5"
                fill={SEVERITY_GLOW[node.severity] ?? colors.stroke}
                opacity="0.7"
              />
            )}

            {/* Node label */}
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={colors.text}
              fontSize="9"
              fontFamily="monospace"
              fontWeight="600"
            >
              {node.label.length > 18
                ? node.label.slice(0, 16) + ".."
                : node.label}
            </text>

            {/* Node type indicator */}
            <text
              x={node.x + node.width - 6}
              y={node.y + 10}
              textAnchor="end"
              fill={colors.stroke}
              fontSize="6"
              fontFamily="monospace"
              opacity="0.5"
            >
              {node.type.toUpperCase()}
            </text>

            {/* Hover tooltip */}
            {isHovered && node.description && (
              <g>
                <rect
                  x={node.x + node.width + 8}
                  y={node.y - 4}
                  width={180}
                  height={
                    28 +
                    ((node.cveIds?.length ?? 0) > 0 ? 14 : 0) +
                    ((node.cweIds?.length ?? 0) > 0 ? 14 : 0)
                  }
                  rx="4"
                  fill="#0f172a"
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <text
                  x={node.x + node.width + 16}
                  y={node.y + 10}
                  fill="#e2e8f0"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {node.description.slice(0, 60)}
                </text>
                {node.cveIds && node.cveIds.length > 0 && (
                  <text
                    x={node.x + node.width + 16}
                    y={node.y + 24}
                    fill="#f87171"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {node.cveIds.join(", ")}
                  </text>
                )}
                {node.cweIds && node.cweIds.length > 0 && (
                  <text
                    x={node.x + node.width + 16}
                    y={
                      node.y +
                      24 +
                      ((node.cveIds?.length ?? 0) > 0 ? 14 : 0)
                    }
                    fill="#fb923c"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {node.cweIds.join(", ")}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
