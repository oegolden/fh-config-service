// src/fh_functions.js
const API_BASE_URL = "http://localhost:5000/api"; // Proxy server

async function apiRequest(endpoint, method = "GET", data = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (data) {
    options.body = JSON.stringify(data);
    // If this is a sync request, extract environment from data
    // For sync-related endpoints, provide the env var name so the proxy can look up the real key
    if (endpoint === 'sync' && data.sourceEnv) {
      options.headers.Authorization = `Bearer ${data.sourceEnv}`;
    }
    if (endpoint === 'sync/revert' && data.targetEnv) {
      options.headers.Authorization = `Bearer ${data.targetEnv}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, options);
  if (!response.ok) {
    throw new Error(`API error (${response.status}): ${response.statusText}`);
  }
  return response.json();
}

// 🔥 INCIDENTS
export const getIncidents = () => apiRequest("incident_types");
export const getIncidentById = (id) => apiRequest(`incident_types/${id}`);
export const createIncident = (data) => apiRequest("incident_types", "POST", data);
export const updateIncident = (id, data) => apiRequest(`incident_types/${id}`, "PATCH", data);

// 📘 RUNBOOKS
export const getRunbooks = () => apiRequest("runbooks");
export const getRunbookById = (id) => apiRequest(`runbooks/${id}`);
export const createRunbook = (data) => apiRequest("runbooks", "POST", data);
export const updateRunbook = (id, data) => apiRequest(`runbooks/${id}`, "PUT", data);

// ⚙️ SERVICES
export const getServices = () => apiRequest("services");
export const getServiceById = (id) => apiRequest(`services/${id}`);
export const createService = (data) => apiRequest("services", "POST", data);
export const updateService = (id, data) => apiRequest(`services/${id}`, "PATCH", data);

// 🛠️ FUNCTIONALITIES
export const getFunctionalities = () => apiRequest("functionalities");
export const getFunctionalityById = (id) => apiRequest(`functionalities/${id}`);
export const createFunctionality = (data) => apiRequest("functionalities", "POST", data);
export const updateFunctionality = (id, data) => apiRequest(`functionalities/${id}`, "PATCH", data);

// 🌍 ENVIRONMENTS
export const getEnvironments = () => apiRequest("environments");
export const getEnvironmentById = (id) => apiRequest(`environments/${id}`);
export const createEnvironment = (data) => apiRequest("environments", "POST", data);
export const updateEnvironment = (id, data) => apiRequest(`environments/${id}`, "PATCH", data);

// ⚙️ SETTINGS
export const getSettings = () => apiRequest("custom_fields/definitions");
export const getSettingById = (id) => apiRequest(`custom_fields/definitions/${id}/select_options`);
export const createSetting = (data) => apiRequest("custom_fields/definitions", "POST", data);
export const updateSetting = (id, data) => apiRequest(`custom_fields/definitions/${id}`, "PATCH", data);

// 🔄 SYNC
export const syncEnvironments = (category, sourceEnv, targetEnv) => {
  return apiRequest('sync', 'POST', {
    category,
    sourceEnv,
    targetEnv
  });
};

// List backups on the server
export const listSyncBackups = () => {
  return apiRequest('sync/backups', 'GET');
};

// Revert a backup by filename (provide targetEnv so server can look up API key)
export const revertBackup = (backupFile, targetEnv) => {
  return apiRequest('sync/revert', 'POST', { backupFile, targetEnv });
};
