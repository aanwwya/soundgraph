import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import {
  clampNodePosition,
  getRecords,
  GRAPH_MARGIN,
  isOnGraph,
} from "./graphUtils.js";

function nodeBox(node) {
  return {
    width: node.size?.width ?? 140,
    height: node.size?.height ?? 40,
  };
}

function linkDistance(edge, scale) {
  const type = edge.data?.relType;
  let distance = 230;
  if (type === "released") distance = 160;
  if (type === "belongs_to") distance = 220;
  if (type === "subgenre_of") distance = 250;
  return distance * Math.max(0.55, scale);
}

function layoutScale(width, height) {
  return Math.min(1, width / 1080, height / 760);
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

// React Flow positions are top-left. Circular collide treated them as
// centers, so wide labels still crossed. Separate the actual boxes.
function forceLabelCollide(padding, passes = 3) {
  let nodes = [];

  function force() {
    const count = nodes.length;

    for (let pass = 0; pass < passes; pass += 1) {
      for (let i = 0; i < count; i += 1) {
        const a = nodes[i];
        const aSize = nodeBox(a);

        for (let j = i + 1; j < count; j += 1) {
          const b = nodes[j];
          const aFixed = a.fx != null;
          const bFixed = b.fx != null;
          if (aFixed && bFixed) continue;

          const bSize = nodeBox(b);
          const overlapX =
            Math.min(a.x + aSize.width + padding, b.x + bSize.width + padding) -
            Math.max(a.x - padding, b.x - padding);
          const overlapY =
            Math.min(a.y + aSize.height + padding, b.y + bSize.height + padding) -
            Math.max(a.y - padding, b.y - padding);

          if (overlapX <= 0 || overlapY <= 0) continue;

          const share = aFixed || bFixed ? 1 : 0.5;
          const aCx = a.x + aSize.width / 2;
          const aCy = a.y + aSize.height / 2;
          const bCx = b.x + bSize.width / 2;
          const bCy = b.y + bSize.height / 2;

          if (overlapX < overlapY) {
            const sign = aCx <= bCx ? -1 : 1;
            const shift = overlapX * share;
            if (!aFixed) {
              a.x += sign * shift;
              a.vx = sign * Math.abs(shift);
            }
            if (!bFixed) {
              b.x -= sign * shift;
              b.vx = -sign * Math.abs(shift);
            }
          } else {
            const sign = aCy <= bCy ? -1 : 1;
            const shift = overlapY * share;
            if (!aFixed) {
              a.y += sign * shift;
              a.vy = sign * Math.abs(shift);
            }
            if (!bFixed) {
              b.y -= sign * shift;
              b.vy = -sign * Math.abs(shift);
            }
          }
        }
      }
    }
  }

  force.initialize = (initNodes) => {
    nodes = initNodes;
  };

  return force;
}

function bindSimulationTicks(simulation, simNodes, onTick, onEnd) {
  const tickMap = new Map(simNodes.map((node) => [node.id, node]));

  simulation.on("tick", () => {
    onTick(tickMap);
  });

  simulation.on("end", () => {
    simulation.stop();
    onEnd?.();
  });
}

export function getMobileWorldSize() {
  const nodeCount = getRecords().filter(isOnGraph).length;
  const area = Math.max(80, nodeCount) * 260 * 90;
  const aspect = 1120 / 1540;
  const width = Math.sqrt(area * aspect);
  const height = width / aspect;

  return {
    width: Math.max(1120, width),
    height: Math.max(1540, height),
  };
}

export function getDesktopWorldSize(viewport) {
  const nodeCount = getRecords().filter(isOnGraph).length;
  const aspect = Math.max(
    0.55,
    (viewport.width || 1280) / Math.max(1, viewport.height || 800)
  );
  const area = Math.max(80, nodeCount) * 240 * 84;
  const width = Math.sqrt(area * aspect);
  const height = width / aspect;

  return {
    width: Math.max((viewport.width || 0) * 1.12, width),
    height: Math.max((viewport.height || 0) * 1.12, height),
  };
}

function createMobileForceSimulation({ nodes, edges, box, onTick, onEnd }) {
  const world = box ?? getMobileWorldSize();

  const simNodes = nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    label: node.data?.label ?? "",
    nodeType: node.type,
    size: node.data?.size ?? { width: 140, height: 40 },
  }));

  const simLinks = edges.map((edge) => {
    const type = edge.data?.relType;
    let distance = 290;
    if (type === "released") distance = 220;
    if (type === "belongs_to") distance = 280;
    if (type === "subgenre_of") distance = 330;
    return { source: edge.source, target: edge.target, distance };
  });

  const simulation = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-1080))
    .force(
      "link",
      forceLink(simLinks)
        .id((node) => node.id)
        .distance((link) => link.distance)
        .strength(0.16)
    )
    .force("x", forceX(world.width / 2).strength(0.01))
    .force("y", forceY(world.height / 2).strength(0.01))
    .force("collide", forceLabelCollide(28, 5))
    .alpha(0.9)
    .alphaDecay(0.028)
    .alphaMin(0.012)
    .velocityDecay(0.4);

  bindSimulationTicks(simulation, simNodes, onTick, onEnd);

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
    return createMobileForceSimulation({ nodes, edges, box, onTick, onEnd });
  }

  const scale = layoutScale(box.width, box.height);

  const simNodes = nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    label: node.data?.label ?? "",
    nodeType: node.type,
    size: node.data?.size ?? { width: 140, height: 40 },
  }));

  const simLinks = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    distance: linkDistance(edge, scale),
  }));

  const simulation = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-520 * Math.max(0.55, scale)))
    .force(
      "link",
      forceLink(simLinks)
        .id((node) => node.id)
        .distance((link) => link.distance)
        .strength(0.2)
    )
    .force("x", forceX(box.width / 2).strength(0.01))
    .force("y", forceY(box.height / 2).strength(0.01))
    .force("bounds", forceBounds(simNodes, box))
    .force("collide", forceLabelCollide(22, 8))
    .alpha(0.9)
    .alphaDecay(0.026)
    .alphaMin(0.012)
    .velocityDecay(0.48);

  bindSimulationTicks(simulation, simNodes, onTick, onEnd);

  return { simulation, simNodes, box };
}

export function resizeSimulation(simulation, box) {
  const scale = layoutScale(box.width, box.height);
  simulation.force("x", forceX(box.width / 2).strength(0.01));
  simulation.force("y", forceY(box.height / 2).strength(0.01));
  simulation.force("charge", forceManyBody().strength(-520 * Math.max(0.55, scale)));
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
