import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { clampNodePosition, GRAPH_MARGIN } from "./graphUtils.js";

function collisionRadius(node, scale) {
  const label = node.label ?? "";
  const charWidth = node.nodeType === "genre" ? 13 : node.nodeType === "artist" ? 10 : 7;
  const base = Math.max(40, label.length * charWidth * 0.5) + 22;
  return base * Math.max(0.62, scale);
}

function linkDistance(edge, scale) {
  const type = edge.data?.relType;
  let distance = 200;
  if (type === "released") distance = 140;
  if (type === "belongs_to") distance = 190;
  if (type === "subgenre_of") distance = 220;
  return distance * Math.max(0.55, scale);
}

function layoutScale(width, height) {
  return Math.min(1, width / 1080, height / 760);
}

function forceWander(simNodes, intensity) {
  let time = 0;

  return () => {
    time += 0.01;

    for (let index = 0; index < simNodes.length; index += 1) {
      const node = simNodes[index];
      if (node.fx != null) continue;

      node.vx += Math.sin(time + index * 1.7) * intensity;
      node.vy += Math.cos(time * 0.85 + index * 2.3) * intensity;
    }
  };
}

function forceBounds(simNodes, box) {
  return () => {
    for (const node of simNodes) {
      const size = node.size ?? { width: 140, height: 40 };
      const next = clampNodePosition(
        { x: node.x, y: node.y },
        size,
        box,
        GRAPH_MARGIN
      );

      if (next.x !== node.x) {
        node.vx *= -0.22;
      }
      if (next.y !== node.y) {
        node.vy *= -0.22;
      }

      node.x = next.x;
      node.y = next.y;

      if (node.fx != null) {
        node.fx = next.x;
        node.fy = next.y;
      }
    }
  };
}

const MOBILE_WORLD = { width: 980, height: 1320 };

export function getMobileWorldSize() {
  return { ...MOBILE_WORLD };
}

function createMobileForceSimulation({ nodes, edges, onTick, onEnd }) {
  const world = MOBILE_WORLD;

  const simNodes = nodes.map((node) => {
    const size = node.data?.size ?? { width: 140, height: 40 };
    const label = node.data?.label ?? "";
    const extra = node.type === "genre" ? 36 : 28;

    return {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      label,
      nodeType: node.type,
      size,
      radius: Math.max(size.width, size.height) / 2 + extra,
    };
  });

  const simLinks = edges.map((edge) => {
    const type = edge.data?.relType;
    let distance = 260;
    if (type === "released") distance = 200;
    if (type === "belongs_to") distance = 250;
    if (type === "subgenre_of") distance = 300;
    return { source: edge.source, target: edge.target, distance };
  });

  const simulation = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-920))
    .force(
      "link",
      forceLink(simLinks)
        .id((node) => node.id)
        .distance((link) => link.distance)
        .strength(0.18)
    )
    .force(
      "collide",
      forceCollide((node) => node.radius).iterations(4)
    )
    .force("x", forceX(world.width / 2).strength(0.012))
    .force("y", forceY(world.height / 2).strength(0.012))
    .alpha(0.9)
    .alphaDecay(0.028)
    .alphaMin(0.012)
    .velocityDecay(0.4);

  simulation.on("tick", () => {
    onTick(new Map(simNodes.map((node) => [node.id, node])));
  });

  if (onEnd) {
    simulation.on("end", onEnd);
  }

  return { simulation, simNodes, box: world };
}

export function createForceSimulation({
  nodes,
  edges,
  box,
  onTick,
  onEnd,
  isMobile = false,
}) {
  if (isMobile) {
    return createMobileForceSimulation({ nodes, edges, onTick, onEnd });
  }

  const scale = layoutScale(box.width, box.height);

  const simNodes = nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    label: node.data?.label ?? "",
    nodeType: node.type,
    size: node.data?.size ?? { width: 140, height: 40 },
    radius: collisionRadius(
      { label: node.data?.label ?? "", nodeType: node.type },
      scale
    ),
  }));

  const simLinks = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    distance: linkDistance(edge, scale),
  }));

  const simulation = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-380 * Math.max(0.55, scale)))
    .force(
      "link",
      forceLink(simLinks)
        .id((node) => node.id)
        .distance((link) => link.distance)
        .strength(0.22)
    )
    .force(
      "collide",
      forceCollide((node) => node.radius).iterations(2)
    )
    .force("x", forceX(box.width / 2).strength(0.018))
    .force("y", forceY(box.height / 2).strength(0.018))
    .force("wander", forceWander(simNodes, 0.16 * Math.max(0.7, scale)))
    .force("bounds", forceBounds(simNodes, box))
    .alpha(0.24)
    .alphaDecay(0)
    .alphaTarget(0.1)
    .velocityDecay(0.62);

  simulation.on("tick", () => {
    onTick(new Map(simNodes.map((node) => [node.id, node])));
  });

  return { simulation, simNodes, box };
}

export function resizeSimulation(simulation, box) {
  const scale = layoutScale(box.width, box.height);
  simulation.force("x", forceX(box.width / 2).strength(0.018));
  simulation.force("y", forceY(box.height / 2).strength(0.018));
  simulation.force("charge", forceManyBody().strength(-380 * Math.max(0.55, scale)));
}

export function pinSimNode(simNodes, id, x, y) {
  const node = simNodes.find((item) => item.id === id);
  if (!node) return;
  node.fx = x;
  node.fy = y;
  node.x = x;
  node.y = y;
}

export function unpinSimNode(simNodes, id) {
  const node = simNodes.find((item) => item.id === id);
  if (!node) return;
  node.fx = null;
  node.fy = null;
}

export function syncSimNodeSize(simNodes, id, size) {
  const node = simNodes.find((item) => item.id === id);
  if (!node || !size) return;
  node.size = size;
}
