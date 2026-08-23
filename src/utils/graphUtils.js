import { records, relationships } from "../data/sampleGraph.js";

export const GRAPH_MARGIN = 28;

function estimateNodeSize(record) {
  const label = record.name ?? "";
  if (record.type === "genre") {
    return { width: Math.max(88, label.length * 15), height: 48 };
  }
  if (record.type === "artist") {
    return { width: Math.max(72, label.length * 11), height: 36 };
  }
  return { width: Math.max(64, label.length * 8), height: 28 };
}

export function getNodeSize(node) {
  if (node?.measured?.width && node?.measured?.height) {
    return { width: node.measured.width, height: node.measured.height };
  }
  if (node?.data?.size) return node.data.size;
  return { width: 140, height: 40 };
}

export function clampNodePosition(position, size, container, margin = GRAPH_MARGIN) {
  const width = size?.width || 140;
  const height = size?.height || 40;
  const maxX = Math.max(margin, (container.width || 0) - width - margin);
  const maxY = Math.max(margin, (container.height || 0) - height - margin);

  return {
    x: Math.min(Math.max(position.x, margin), maxX),
    y: Math.min(Math.max(position.y, margin), maxY),
  };
}

function seedPosition(width, height, size) {
  const innerWidth = Math.max(40, width - GRAPH_MARGIN * 2 - (size?.width ?? 140));
  const innerHeight = Math.max(40, height - GRAPH_MARGIN * 2 - (size?.height ?? 40));

  return {
    x: GRAPH_MARGIN + Math.random() * innerWidth,
    y: GRAPH_MARGIN + Math.random() * innerHeight,
  };
}

export function getRecords() {
  return records;
}

export function getRelationships() {
  return relationships;
}

export function getRecordById(id) {
  return records.find((record) => record.id === id) ?? null;
}

export function getNeighborIds(id) {
  const neighborIds = new Set();

  for (const rel of relationships) {
    if (rel.source === id) neighborIds.add(rel.target);
    if (rel.target === id) neighborIds.add(rel.source);
  }

  return neighborIds;
}

export function getNeighborRecords(id) {
  return [...getNeighborIds(id)]
    .map((neighborId) => getRecordById(neighborId))
    .filter(Boolean);
}

export function getRecordsByIds(ids = []) {
  return ids.map((id) => getRecordById(id)).filter(Boolean);
}

export function getDescriptionParagraphs(record) {
  if (!record?.description) return [];
  return Array.isArray(record.description)
    ? record.description
    : [record.description];
}

export function isOnGraph(record) {
  return Boolean(record) && record.onGraph !== false;
}

export function createFlowNodes(
  width = window.innerWidth,
  height = window.innerHeight
) {
  return records.filter(isOnGraph).map((record) => {
    const size = estimateNodeSize(record);
    return {
      id: record.id,
      type: record.type,
      position: seedPosition(width, height, size),
      data: {
        label: record.name,
        nodeType: record.type,
        dimmed: false,
        size,
      },
      draggable: true,
    };
  });
}

export function createFlowEdges() {
  return relationships
    .filter((rel) => {
      return isOnGraph(getRecordById(rel.source)) && isOnGraph(getRecordById(rel.target));
    })
    .map((rel) => ({
      id: `${rel.source}-${rel.type}-${rel.target}`,
      source: rel.source,
      target: rel.target,
      type: "default",
      data: { relType: rel.type },
      className: "",
    }));
}

export function applySelectionState(nodes, edges, selectedId) {
  const neighbors = selectedId ? getNeighborIds(selectedId) : new Set();

  const nextNodes = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      dimmed: Boolean(
        selectedId && node.id !== selectedId && !neighbors.has(node.id)
      ),
    },
    selected: node.id === selectedId,
  }));

  const nextEdges = edges.map((edge) => {
    const related =
      Boolean(selectedId) &&
      (edge.source === selectedId || edge.target === selectedId);

    return {
      ...edge,
      className: related ? "is-related" : selectedId ? "is-faded" : "",
    };
  });

  return { nodes: nextNodes, edges: nextEdges };
}
