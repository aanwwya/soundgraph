import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import MusicGraph from "../components/MusicGraph.jsx";
import GraphControls from "../components/GraphControls.jsx";
import InfoPanel from "../components/InfoPanel.jsx";
import { getRecordById } from "../utils/graphUtils.js";

export default function Home() {
  const [selectedId, setSelectedId] = useState(null);
  const [resetNonce, setResetNonce] = useState(0);
  const selectedRecord = getRecordById(selectedId);

  return (
    <ReactFlowProvider>
      <div className={`home ${selectedRecord ? "has-panel" : ""}`}>
        <header className="site-mark">
          <p className="site-mark__title">soundgraph</p>
          <p className="site-mark__note">for the sounds you haven't found yet</p>
        </header>

        <MusicGraph
          selectedId={selectedId}
          onSelect={setSelectedId}
          resetNonce={resetNonce}
          hasPanel={Boolean(selectedRecord)}
        />

        <GraphControls
          onReset={() => {
            setSelectedId(null);
            setResetNonce((value) => value + 1);
          }}
        />

        <InfoPanel
          record={selectedRecord}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </ReactFlowProvider>
  );
}
