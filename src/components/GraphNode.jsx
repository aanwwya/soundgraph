import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

const handleStyle = {
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
};

function GraphNode({ data, selected }) {
  const classes = [
    "graph-node",
    `graph-node--${data.nodeType}`,
    selected ? "is-selected" : "",
    data.dimmed ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <Handle
        type="target"
        position={Position.Top}
        className="graph-handle"
        style={handleStyle}
      />
      <span className="graph-node__label">{data.label}</span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="graph-handle"
        style={handleStyle}
      />
    </div>
  );
}

export default memo(GraphNode, (prev, next) => {
  return (
    prev.selected === next.selected &&
    prev.data.label === next.data.label &&
    prev.data.dimmed === next.data.dimmed &&
    prev.data.nodeType === next.data.nodeType
  );
});
