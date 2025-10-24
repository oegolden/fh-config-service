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

// API endpoints for each entity type
const API_ENDPOINTS = {
  Incidents: 'incident_types',
  Runbooks: 'runbooks',
  Services: 'services',
  Functionalities: 'functionalities',
  Environments: 'environments',
  Settings: 'custom_fields/definitions',
};

// Map for entity display names to API endpoints
const ENTITY_MAP = API_ENDPOINTS;

const ENVIRONMENTS = [
  { id: 'FH_API_KEY_STATUSBOARD_SANDBOX', label: 'Statusboard Sandbox' },
  { id: 'FH_API_KEY__SANDBOX', label: 'Sandbox' }
];

export default function EntityViewer() {
  const [data, setData] = useState({});
  const [selected, setSelected] = useState({});
  const [selectedEnvironment, setSelectedEnvironment] = useState('FH_API_KEY_STATUSBOARD_SANDBOX');
  const [lastSelectedEntity, setLastSelectedEntity] = useState(null);

  // Fetch all entity data
  const fetchEntities = async (entity) => {
    if (!selectedEnvironment) {
      console.warn('No environment selected');
      return;
    }

    try {
      console.log(`Fetching ${entity} using ${selectedEnvironment}`); // Debug log
      const endpoint = ENTITY_MAP[entity];
      
      const response = await fetch(`http://localhost:5000/api/${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedEnvironment}`, // Pass API key directly in Authorization header
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Raw ${entity} response:`, data); // Debug log

      // Handle both array responses and responses with a data property
      const arr = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [data];
      console.log(`Processed ${entity}:`, arr);
      setData((prev) => ({ ...prev, [entity]: arr }));
    } catch (err) {
      console.error(`Error fetching ${entity}:`, err);
      setData((prev) => ({ ...prev, [entity]: [] })); // Set empty array on error
    }
  };

  useEffect(() => {
    Object.keys(ENTITY_MAP).forEach(fetchEntities);
  }, [selectedEnvironment]);

  // Map endpoints back to entity names for quick lookup
  const ENDPOINT_TO_ENTITY = Object.fromEntries(Object.entries(ENTITY_MAP).map(([k, v]) => [v, k]));

  // Listen for sync events so we can refresh data when a sync/revert affects the currently selected environment
  useEffect(() => {
    const onSyncComplete = (e) => {
      const { category, targetEnv, sourceEnv } = e.detail || {};
      // If the UI is currently showing the target environment (or the source), refresh affected entity
      if (selectedEnvironment === targetEnv || selectedEnvironment === sourceEnv) {
        const entityName = ENDPOINT_TO_ENTITY[category];
        if (entityName) {
          fetchEntities(entityName);
        } else {
          // Unknown category - refresh all
          Object.keys(ENTITY_MAP).forEach(fetchEntities);
        }
      }
    };

    const onRevert = (e) => {
      const { targetEnv, backupFile } = e.detail || {};
      if (selectedEnvironment === targetEnv) {
        // Full refresh for revert
        Object.keys(ENTITY_MAP).forEach(fetchEntities);
      }
    };

    window.addEventListener('fh-sync-complete', onSyncComplete);
    window.addEventListener('fh-sync-reverted', onRevert);
    return () => {
      window.removeEventListener('fh-sync-complete', onSyncComplete);
      window.removeEventListener('fh-sync-reverted', onRevert);
    };
  }, [selectedEnvironment]);

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
        <div className="flex items-center justify-between mt-4">
          <p className="text-gray-600">
            Manage and view configurations across incidents, runbooks, services, functionalities, environments, and settings.
          </p>
          <div className="w-64">
            <select
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {ENVIRONMENTS.map(env => (
                <option key={env.id} value={env.id}>
                  {env.label}
                </option>
              ))}
            </select>
          </div>
        </div>
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
                      <option key={item.id || item.field_id} value={item.id || item.field_id}>
                        {item.name || item.title || item.display_name || item.id || item.field_id}
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
                (x) => (x.id || x.field_id) === selected[lastSelectedEntity]
              );
              if (!entityData) return null;
              return (
                <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg max-h-[80vh] overflow-auto">
                  <h2 className="text-lg font-semibold text-indigo-700 mb-2">
                    {lastSelectedEntity}: "{entityData.name || entityData.title || entityData.display_name || entityData.id || entityData.field_id}"
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
