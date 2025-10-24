import React from "react";
import EntityViewer from "./component/EntityViewer";
import EnvironmentSync from "./component/EnvironmentSync";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <EnvironmentSync />
      <EntityViewer />
    </div>
  );
}
