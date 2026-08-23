export default function GraphControls({ onReset }) {
  return (
    <div className="graph-controls">
      <button type="button" onClick={onReset}>
        reset
      </button>
    </div>
  );
}
