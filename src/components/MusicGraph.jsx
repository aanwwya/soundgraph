import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "@xyflow/react";
import GraphNode from "./GraphNode.jsx";
import {
  applySelectionState,
  clampNodePosition,
  createFlowEdges,
  createFlowNodes,
  getNeighborIds,
  getNodeSize,
} from "../utils/graphUtils.js";
import {
  createForceSimulation,
  pinSimNode,
  resizeSimulation,
  syncSimNodeSize,
  unpinSimNode,
} from "../utils/forceLayout.js";

const nodeTypes = {
  genre: GraphNode,
  artist: GraphNode,
  album: GraphNode,
};

const defaultEdgeOptions = {
  type: "default",
};

export default function MusicGraph({
  selectedId,
  onSelect,
  resetNonce,
  hasPanel,
}) {
  const frameRef = useRef(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(createFlowEdges());
  const { setViewport } = useReactFlow();
  const selectedIdRef = useRef(selectedId);
  const simRef = useRef(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const ready = bounds.width >= 80 && bounds.height >= 80;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBounds({ width, height });
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const neighbors = selectedId ? getNeighborIds(selectedId) : new Set();

    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          dimmed: Boolean(
            selectedId && node.id !== selectedId && !neighbors.has(node.id)
          ),
        },
        selected: node.id === selectedId,
      }))
    );

    setEdges((current) =>
      current.map((edge) => {
        const related =
          Boolean(selectedId) &&
          (edge.source === selectedId || edge.target === selectedId);

        return {
          ...edge,
          className: related ? "is-related" : selectedId ? "is-faded" : "",
        };
      })
    );
  }, [selectedId, setNodes, setEdges]);

  useEffect(() => {
    if (!ready) return undefined;

    const box = {
      width: boundsRef.current.width,
      height: boundsRef.current.height,
    };
    const seededNodes = createFlowNodes(box.width, box.height).map((node) => ({
      ...node,
      position: clampNodePosition(node.position, node.data.size, box),
    }));
    const seededEdges = createFlowEdges();
    const next = applySelectionState(
      seededNodes,
      seededEdges,
      selectedIdRef.current
    );

    setNodes(next.nodes);
    setEdges(next.edges);
    setViewport({ x: 0, y: 0, zoom: 1 });

    const { simulation, simNodes } = createForceSimulation({
      nodes: next.nodes,
      edges: next.edges,
      box,
      onTick: (positions) => {
        setNodes((current) =>
          current.map((node) => {
            const simNode = positions.get(node.id);
            if (!simNode) return node;

            const size = getNodeSize(node);
            syncSimNodeSize(simNodes, node.id, size);
            return {
              ...node,
              position: clampNodePosition(
                { x: simNode.x, y: simNode.y },
                size,
                boundsRef.current
              ),
            };
          })
        );
      },
    });

    simRef.current = { simulation, simNodes, box };

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [ready, resetNonce, setNodes, setEdges, setViewport]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim || !ready) return;

    sim.box.width = bounds.width;
    sim.box.height = bounds.height;
    resizeSimulation(sim.simulation, sim.box);
    setViewport({ x: 0, y: 0, zoom: 1 });

    setNodes((current) =>
      current.map((node) => {
        const size = getNodeSize(node);
        syncSimNodeSize(sim.simNodes, node.id, size);
        return {
          ...node,
          position: clampNodePosition(node.position, size, bounds),
        };
      })
    );
  }, [bounds, ready, setNodes, setViewport]);

  function clampDrag(id, position) {
    const node = nodes.find((item) => item.id === id);
    return clampNodePosition(position, getNodeSize(node), boundsRef.current);
  }

  function handleNodesChange(changes) {
    onNodesChange(
      changes.map((change) => {
        if (change.type !== "position" || !change.position) return change;
        return {
          ...change,
          position: clampDrag(change.id, change.position),
        };
      })
    );
  }

  function handleNodeDrag(_, node) {
    const sim = simRef.current;
    if (!sim) return;
    const position = clampDrag(node.id, node.position);
    pinSimNode(sim.simNodes, node.id, position.x, position.y);
  }

  function handleNodeDragStop(_, node) {
    const sim = simRef.current;
    if (!sim) return;
    const position = clampDrag(node.id, node.position);
    pinSimNode(sim.simNodes, node.id, position.x, position.y);
    unpinSimNode(sim.simNodes, node.id);
  }

  return (
    <div
      ref={frameRef}
      className={`graph-frame ${hasPanel ? "has-panel" : ""}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => onSelect(null)}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={1}
        maxZoom={1}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        className="music-graph"
      />
    </div>
  );
}
