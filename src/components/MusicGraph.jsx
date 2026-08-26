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
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const lastZoomRef = useRef(1);
  const syncingFromFlowRef = useRef(false);
  const syncingFromBarRef = useRef(false);
  const fittedRef = useRef(false);
  const nodesRef = useRef(nodes);
  const moveRafRef = useRef(0);
  const fitViewRef = useRef(fitView);
  const getViewportRef = useRef(getViewport);
  const [isMobile, setIsMobile] = useState(readIsMobile);
  const ready = bounds.width >= 80 && bounds.height >= 80;

  boundsRef.current = bounds;
  selectedIdRef.current = selectedId;
  nodesRef.current = nodes;
  fitViewRef.current = fitView;
  getViewportRef.current = getViewport;

  const syncScrollbars = useCallback((viewport, { size = false } = {}) => {
    const frame = frameRef.current;
    const hScroll = hScrollRef.current;
    const vScroll = vScrollRef.current;
    const world = simRef.current?.box;
    if (!frame || !hScroll || !vScroll || !world) return;

    if (size || lastZoomRef.current !== viewport.zoom) {
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
      lastZoomRef.current = viewport.zoom;
    }

    const nextLeft = Math.max(0, -viewport.x);
    const nextTop = Math.max(0, -viewport.y);

    syncingFromFlowRef.current = true;
    if (Math.abs(hScroll.scrollLeft - nextLeft) > 0.5) {
      hScroll.scrollLeft = nextLeft;
    }
    if (Math.abs(vScroll.scrollTop - nextTop) > 0.5) {
      vScroll.scrollTop = nextTop;
    }
    syncingFromFlowRef.current = false;
  }, []);

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
      const prev = boundsRef.current;
      if (
        Math.abs(prev.width - width) < 1 &&
        Math.abs(prev.height - height) < 1
      ) {
        return;
      }
      setBounds({ width, height });
      syncScrollbars(viewportRef.current, { size: true });
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, [syncScrollbars]);

  useEffect(() => {
    const neighbors = selectedId ? getNeighborIds(selectedId) : new Set();

    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const dimmed = Boolean(
          selectedId && node.id !== selectedId && !neighbors.has(node.id)
        );
        const selected = node.id === selectedId;
        if (node.selected === selected && node.data.dimmed === dimmed) {
          return node;
        }
        changed = true;
        return {
          ...node,
          selected,
          data:
            node.data.dimmed === dimmed
              ? node.data
              : { ...node.data, dimmed },
        };
      });
      return changed ? next : current;
    });

    setEdges((current) => {
      let changed = false;
      const next = current.map((edge) => {
        const related =
          Boolean(selectedId) &&
          (edge.source === selectedId || edge.target === selectedId);
        const className = related ? "is-related" : selectedId ? "is-faded" : "";
        if (edge.className === className) return edge;
        changed = true;
        return { ...edge, className };
      });
      return changed ? next : current;
    });
  }, [selectedId, setNodes, setEdges]);

  useEffect(() => {
    if (!ready) return undefined;

    fittedRef.current = false;
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

    const applyTick = (positions) => {
      setNodes((current) => {
        let changed = false;
        const mapped = current.map((node) => {
          const simNode = positions.get(node.id);
          if (!simNode) return node;

          const size = getNodeSize(node);
          syncSimNodeSize(simRef.current?.simNodes, node.id, size);

          const nextPosition = isMobile
            ? { x: simNode.x, y: simNode.y }
            : clampNodePosition(
                { x: simNode.x, y: simNode.y },
                size,
                simRef.current?.box ?? box
              );

          if (
            node.position.x === nextPosition.x &&
            node.position.y === nextPosition.y
          ) {
            return node;
          }
          changed = true;
          return { ...node, position: nextPosition };
        });
        return changed ? mapped : current;
      });
    };

    const { simulation, simNodes } = createForceSimulation({
      nodes: next.nodes,
      edges: next.edges,
      box,
      isMobile,
      onTick: (positions) => {
        applyTick(positions);
      },
      onEnd: () => {
        if (fittedRef.current) return;
        fittedRef.current = true;
        requestAnimationFrame(() => {
          const duration = isMobile ? 420 : 0;
          if (isMobile) {
            fitViewRef.current({ padding: 0.18, duration, maxZoom: 0.95 });
          } else {
            fitViewRef.current({ padding: 0.12, duration, maxZoom: 1 });
          }
          window.setTimeout(() => {
            const viewport = getViewportRef.current();
            viewportRef.current = viewport;
            syncScrollbars(viewport, { size: true });
          }, duration + 32);
        });
      },
    });

    simRef.current = { simulation, simNodes, box, isMobile };
    syncScrollbars(viewportRef.current, { size: true });

    return () => {
      fittedRef.current = false;
      simulation.stop();
      simRef.current = null;
    };
  }, [ready, resetNonce, isMobile, setNodes, setEdges, syncScrollbars]);

  const handleMove = useCallback(
    (_, viewport) => {
      viewportRef.current = viewport;
      if (syncingFromBarRef.current) return;
      if (moveRafRef.current) return;
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        syncScrollbars(viewportRef.current);
      });
    },
    [syncScrollbars]
  );

  const handleMoveEnd = useCallback(
    (_, viewport) => {
      viewportRef.current = viewport;
      if (moveRafRef.current) {
        cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = 0;
      }
      if (!syncingFromBarRef.current) {
        syncScrollbars(viewport, { size: true });
      }
    },
    [syncScrollbars]
  );

  const handleBarScroll = useCallback(
    (axis) => {
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
    },
    [setViewport]
  );

  const clampDrag = useCallback((id, position) => {
    if (isMobile) return position;
    const node = nodesRef.current.find((item) => item.id === id);
    const box = simRef.current?.box ?? boundsRef.current;
    return clampNodePosition(position, getNodeSize(node), box);
  }, [isMobile]);

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(
        changes.map((change) => {
          if (change.type !== "position" || !change.position) {
            return change;
          }
          if (change.dragging !== true && change.dragging !== false) {
            return change;
          }
          return {
            ...change,
            position: clampDrag(change.id, change.position),
          };
        })
      );
    },
    [onNodesChange, clampDrag]
  );

  const handleNodeDrag = useCallback(
    (_, node) => {
      const sim = simRef.current;
      if (!sim) return;
      const position = clampDrag(node.id, node.position);
      pinSimNode(sim.simNodes, node.id, position.x, position.y);
    },
    [clampDrag]
  );

  const handleNodeDragStop = useCallback(
    (_, node) => {
      const sim = simRef.current;
      if (!sim) return;
      const position = clampDrag(node.id, node.position);
      pinSimNode(sim.simNodes, node.id, position.x, position.y);
      unpinSimNode(sim.simNodes, node.id);
    },
    [clampDrag]
  );

  const handleNodeClick = useCallback(
    (_, node) => {
      onSelect(node.id);
    },
    [onSelect]
  );

  const handlePaneClick = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

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
          onNodeClick={handleNodeClick}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={handlePaneClick}
          onMove={handleMove}
          onMoveEnd={handleMoveEnd}
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
