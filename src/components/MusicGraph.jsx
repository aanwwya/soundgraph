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
  getMobileWorldSize,
  pinSimNode,
  resizeSimulation,
  syncSimNodeSize,
  unpinSimNode,
} from "../utils/forceLayout.js";

const MOBILE_QUERY = "(max-width: 768px)";

function readIsMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

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
  const { setViewport, fitView } = useReactFlow();
  const selectedIdRef = useRef(selectedId);
  const simRef = useRef(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const [isMobile, setIsMobile] = useState(readIsMobile);
  const ready = bounds.width >= 80 && bounds.height >= 80;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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

    const box = isMobile
      ? getMobileWorldSize()
      : {
          width: boundsRef.current.width,
          height: boundsRef.current.height,
        };
    const seededNodes = createFlowNodes(box.width, box.height).map((node) =>
      isMobile
        ? node
        : {
            ...node,
            position: clampNodePosition(node.position, node.data.size, box),
          }
    );
    const seededEdges = createFlowEdges();
    const next = applySelectionState(
      seededNodes,
      seededEdges,
      selectedIdRef.current
    );

    setNodes(next.nodes);
    setEdges(next.edges);
    if (!isMobile) {
      setViewport({ x: 0, y: 0, zoom: 1 });
    }

    const { simulation, simNodes } = createForceSimulation({
      nodes: next.nodes,
      edges: next.edges,
      box,
      isMobile,
      onTick: (positions) => {
        setNodes((current) =>
          current.map((node) => {
            const simNode = positions.get(node.id);
            if (!simNode) return node;

            const size = getNodeSize(node);
            syncSimNodeSize(simNodes, node.id, size);

            const nextPosition = { x: simNode.x, y: simNode.y };

            return {
              ...node,
              position: isMobile
                ? nextPosition
                : clampNodePosition(nextPosition, size, boundsRef.current),
            };
          })
        );
      },
      onEnd: () => {
        if (!isMobile) return;
        requestAnimationFrame(() => {
          fitView({ padding: 0.22, duration: 420, maxZoom: 0.95 });
        });
      },
    });

    simRef.current = { simulation, simNodes, box, isMobile };

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [ready, resetNonce, isMobile, setNodes, setEdges, setViewport, fitView]);

  useEffect(() => {
    if (isMobile) return;

    const sim = simRef.current;
    if (!sim || !ready) return;

    sim.box.width = bounds.width;
    sim.box.height = bounds.height;
    resizeSimulation(sim.simulation, sim.box);

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
  }, [bounds, ready, isMobile, setNodes]);

  function clampDrag(id, position) {
    if (isMobile) return position;
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
        minZoom={0.28}
        maxZoom={2.2}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
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
