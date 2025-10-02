// src/fh_functions.js
const API_BASE_URL = "http://localhost:5000/api"; // Proxy server

async function apiRequest(endpoint, method = "GET", data = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (data) options.body = JSON.stringify(data);

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
export const getSettings = () => apiRequest("settings");
export const getSettingById = (id) => apiRequest(`settings/${id}`);
export const createSetting = (data) => apiRequest("settings", "POST", data);
export const updateSetting = (id, data) => apiRequest(`settings/${id}`, "PATCH", data);
