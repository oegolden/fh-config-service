// src/components/EntityViewer.jsx
import React, { useState, useEffect } from "react";
import {
  getIncidents,
  getRunbooks,
  getServices,
  getFunctionalities,
  getEnvironments,
  getSettings,
} from "../fh_functions";
import { JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

const ENTITY_MAP = {
  Incidents: getIncidents,
  Runbooks: getRunbooks,
  Services: getServices,
  Functionalities: getFunctionalities,
  Environments: getEnvironments,
  Settings: getSettings,
};

export default function EntityViewer() {
  const [data, setData] = useState({});
  const [selected, setSelected] = useState({});
  const [lastSelectedEntity, setLastSelectedEntity] = useState(null);

  // Fetch all entity data
  const fetchEntities = async (entity) => {
    try {
      const res = await ENTITY_MAP[entity]();
      const arr = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [res];
      console.log(`Fetched ${entity}:`, arr);
      setData((prev) => ({ ...prev, [entity]: arr }));
    } catch (err) {
      console.error(`Error fetching ${entity}:`, err);
    }
  };

  useEffect(() => {
    Object.keys(ENTITY_MAP).forEach(fetchEntities);
  }, []);

  const handleSelectChange = (entity, value) => {
    setSelected((prev) => ({ ...prev, [entity]: value }));
    setLastSelectedEntity(entity); // update the last selected entity
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-indigo-700">
          FH Configuration Between Environments Service
        </h1>
        <p className="text-gray-600 mt-2">
          Manage and view configurations across incidents, runbooks, services, functionalities, environments, and settings.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 h-[calc(100vh-120px)]">
        {/* Dropdowns */}
        {/* Dropdowns */}
        <div className="w-full md:w-1/3 space-y-4">
          {Object.keys(ENTITY_MAP).map((entity) => (
            <div key={entity} className="mb-4 overflow-visible">
              <label className="block font-semibold text-indigo-700 mb-1">
                {entity.toUpperCase()}
              </label>
              <div className="relative w-full">
                <select
                  className="w-full p-3 bg-indigo-100 text-indigo-900 border border-indigo-300 
    rounded-xl shadow-md transition-all duration-300 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-indigo-500
    hover:shadow-lg appearance-none"
                  value={selected[entity] || ""}
                  onChange={(e) => handleSelectChange(entity, e.target.value)}
                >
                  <option value="">Select {entity}</option>
                  {Array.isArray(data[entity])
                    ? data[entity].map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.title || item.id}
                      </option>
                    ))
                    : []}
                </select>

              </div>
            </div>
          ))}
        </div>


        {/* JSON display */}
        <div className="w-full md:w-2/3 p-6">
          {lastSelectedEntity &&
            selected[lastSelectedEntity] &&
            data[lastSelectedEntity] &&
            (() => {
              const entityData = data[lastSelectedEntity].find(
                (x) => x.id === selected[lastSelectedEntity]
              );
              if (!entityData) return null;
              return (
                <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg max-h-[80vh] overflow-auto">
                  <h2 className="text-lg font-semibold text-indigo-700 mb-2">
                    {lastSelectedEntity}: "{entityData.name || entityData.title || entityData.id}"
                  </h2>
                  <div className="text-sm font-mono text-gray-800">
                    <JsonView
                      data={entityData}
                      theme="light"
                      shouldInitiallyExpand={(level) => level < 2}
                    />
                  </div>
                </div>
              );
            })()}
        </div>

      </div>
    </div>
  );
}
