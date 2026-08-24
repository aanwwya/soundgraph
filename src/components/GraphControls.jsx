export default function GraphControls({ onReset }) {
  return (
    <div className="graph-controls">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onReset();
        }}
      >
        reset
      </button>
    </div>
  );
}
