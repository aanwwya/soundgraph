import { useCallback, useEffect, useRef, useState } from "react";
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
  getDesktopWorldSize,
  getMobileWorldSize,
  pinSimNode,
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
  const hScrollRef = useRef(null);
  const vScrollRef = useRef(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(createFlowEdges());
  const { fitView, setViewport, getViewport } = useReactFlow();
  const selectedIdRef = useRef(selectedId);
  const simRef = useRef(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const syncingFromFlowRef = useRef(false);
  const syncingFromBarRef = useRef(false);
  const syncScrollbarsRef = useRef(() => {});
  const getViewportRef = useRef(getViewport);
  const [isMobile, setIsMobile] = useState(readIsMobile);
  const ready = bounds.width >= 80 && bounds.height >= 80;

  const syncScrollbars = useCallback((viewport) => {
    const frame = frameRef.current;
    const hScroll = hScrollRef.current;
    const vScroll = vScrollRef.current;
    const world = simRef.current?.box;
    if (!frame || !hScroll || !vScroll || !world) return;

    const viewW = frame.clientWidth;
    const viewH = frame.clientHeight;
    const contentW = Math.max(viewW, world.width * viewport.zoom);
    const contentH = Math.max(viewH, world.height * viewport.zoom);
    const needsX = contentW > viewW + 1;
    const needsY = contentH > viewH + 1;

    frame.style.setProperty("--graph-scroll-width", `${contentW}px`);
    frame.style.setProperty("--graph-scroll-height", `${contentH}px`);
    frame.classList.toggle("has-scroll-x", needsX);
    frame.classList.toggle("has-scroll-y", needsY);
    hScroll.classList.toggle("is-active", needsX);
    vScroll.classList.toggle("is-active", needsY);

    const nextLeft = Math.max(0, -viewport.x);
    const nextTop = Math.max(0, -viewport.y);

    syncingFromFlowRef.current = true;
    if (Math.abs(hScroll.scrollLeft - nextLeft) > 0.5) {
      hScroll.scrollLeft = nextLeft;
    }
    if (Math.abs(vScroll.scrollTop - nextTop) > 0.5) {
      vScroll.scrollTop = nextTop;
    }
    requestAnimationFrame(() => {
      syncingFromFlowRef.current = false;
    });
  }, []);

  useEffect(() => {
    getViewportRef.current = getViewport;
    syncScrollbarsRef.current = syncScrollbars;
  }, [getViewport, syncScrollbars]);

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
      syncScrollbarsRef.current(viewportRef.current);
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

    const view = boundsRef.current;
    const box = isMobile ? getMobileWorldSize() : getDesktopWorldSize(view);
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
            const sim = simRef.current;

            return {
              ...node,
              position: isMobile
                ? nextPosition
                : clampNodePosition(nextPosition, size, sim?.box ?? box),
            };
          })
        );
      },
      onEnd: () => {
        requestAnimationFrame(() => {
          const duration = isMobile ? 420 : 0;
          if (isMobile) {
            fitView({ padding: 0.18, duration, maxZoom: 0.95 });
          } else {
            fitView({ padding: 0.12, duration, maxZoom: 1 });
          }
          window.setTimeout(() => {
            const viewport = getViewportRef.current();
            viewportRef.current = viewport;
            syncScrollbarsRef.current(viewport);
          }, duration + 32);
        });
      },
    });

    simRef.current = { simulation, simNodes, box, isMobile };
    syncScrollbars(viewportRef.current);

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [ready, resetNonce, isMobile, setNodes, setEdges, fitView, syncScrollbars]);

  function handleMove(_, viewport) {
    viewportRef.current = viewport;
    if (syncingFromBarRef.current) return;
    syncScrollbars(viewport);
  }

  function handleBarScroll(axis) {
    if (syncingFromFlowRef.current) return;
    const hScroll = hScrollRef.current;
    const vScroll = vScrollRef.current;
    if (!hScroll || !vScroll) return;

    syncingFromBarRef.current = true;
    setViewport({
      x: axis === "x" ? -hScroll.scrollLeft : viewportRef.current.x,
      y: axis === "y" ? -vScroll.scrollTop : viewportRef.current.y,
      zoom: viewportRef.current.zoom,
    });
    requestAnimationFrame(() => {
      syncingFromBarRef.current = false;
    });
  }

  function clampDrag(id, position) {
    if (isMobile) return position;
    const node = nodes.find((item) => item.id === id);
    const box = simRef.current?.box ?? boundsRef.current;
    return clampNodePosition(position, getNodeSize(node), box);
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
      <div className="graph-canvas">
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
          onMove={handleMove}
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
      <div
        ref={hScrollRef}
        className="graph-scrollbar graph-scrollbar--x"
        onScroll={() => handleBarScroll("x")}
        aria-hidden="true"
      >
        <div className="graph-scrollbar__sizer" />
      </div>
      <div
        ref={vScrollRef}
        className="graph-scrollbar graph-scrollbar--y"
        onScroll={() => handleBarScroll("y")}
        aria-hidden="true"
      >
        <div className="graph-scrollbar__sizer" />
      </div>
      <div className="graph-scrollbar-corner" aria-hidden="true" />
    </div>
  );
}
