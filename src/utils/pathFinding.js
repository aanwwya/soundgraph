export function buildAdjacencyList(relationships, { directed = false } = {}) {
  const adjacency = new Map();

  for (const rel of relationships) {
    if (!adjacency.has(rel.source)) adjacency.set(rel.source, []);
    if (!adjacency.has(rel.target)) adjacency.set(rel.target, []);

    adjacency.get(rel.source).push(rel.target);
    if (!directed) {
      adjacency.get(rel.target).push(rel.source);
    }
  }

  return adjacency;
}

export function findPath(adjacencyList, startId, endId) {
  if (!startId || !endId) return [];
  if (startId === endId) return [startId];

  const queue = [startId];
  const visited = new Set([startId]);
  const parent = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjacencyList.get(current) ?? [];

    for (const next of neighbors) {
      if (visited.has(next)) continue;

      visited.add(next);
      parent.set(next, current);

      if (next === endId) {
        const path = [endId];
        let step = endId;

        while (parent.has(step)) {
          step = parent.get(step);
          path.unshift(step);
        }

        return path;
      }

      queue.push(next);
    }
  }

  return [];
}
