import React, { useState } from 'react';
import { syncEnvironments, revertBackup } from '../fh_functions';

const ENVIRONMENTS = [
  { id: 'FH_API_KEY_STATUSBOARD_SANDBOX', label: 'Statusboard Sandbox' },
  { id: 'FH_API_KEY__SANDBOX', label: 'Sandbox' }
];

const CATEGORIES = [
  { id: 'incident_types', label: 'Incident Types' },
  { id: 'runbooks', label: 'Runbooks' },
  { id: 'services', label: 'Services' },
  { id: 'functionalities', label: 'Functionalities' },
  { id: 'custom_fields/definitions', label: 'Settings' }
];

export default function EnvironmentSync() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sourceEnv, setSourceEnv] = useState('');
  const [targetEnv, setTargetEnv] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSync = async () => {
    if (!selectedCategory || !sourceEnv || !targetEnv) {
      alert('Please select source environment, target environment, and category');
      return;
    }
    
    if (sourceEnv === targetEnv) {
      alert('Source and target environments must be different');
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await syncEnvironments(selectedCategory, sourceEnv, targetEnv);
      // syncEnvironments throws on non-OK; if we get here it's success
      setSyncResult({
        success: true,
        message: `Sync completed: ${result.results ? result.results.length + ' items processed' : 'done'}`,
        backupFile: result.backupFile
      });
      // Notify other parts of the app that a sync completed
      try {
        window.dispatchEvent(new CustomEvent('fh-sync-complete', {
          detail: { category: selectedCategory, sourceEnv, targetEnv, backupFile: result.backupFile, results: result.results }
        }));
      } catch (e) {
        console.warn('Failed to dispatch fh-sync-complete event', e);
      }
    } catch (error) {
      // error.message might be JSON or plain text from server; include raw message
      setSyncResult({
        success: false,
        message: `Sync failed: ${error.message}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRevert = async () => {
    if (!syncResult || !syncResult.backupFile) return;
    setIsSyncing(true);
    try {
      const result = await revertBackup(syncResult.backupFile, targetEnv);
      setSyncResult({ success: true, message: `Revert completed: ${result.results ? result.results.length + ' items' : 'done'}` });
        try {
          window.dispatchEvent(new CustomEvent('fh-sync-reverted', {
            detail: { backupFile: syncResult.backupFile, targetEnv, results: result.results }
          }));
        } catch (e) {
          console.warn('Failed to dispatch fh-sync-reverted event', e);
        }
    } catch (err) {
      setSyncResult({ success: false, message: `Revert failed: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
      <h2 className="text-2xl font-bold text-indigo-700 mb-6">Environment Synchronization</h2>

      <div className="space-y-6">
        {/* Environment Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Environment
            </label>
            <select
              value={sourceEnv}
              onChange={(e) => setSourceEnv(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isSyncing}
            >
              <option value="">Select source...</option>
              {ENVIRONMENTS.map(env => (
                <option key={env.id} value={env.id}>
                  {env.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Environment
            </label>
            <select
              value={targetEnv}
              onChange={(e) => setTargetEnv(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isSyncing}
            >
              <option value="">Select target...</option>
              {ENVIRONMENTS.map(env => (
                <option key={env.id} value={env.id}>
                  {env.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Category to Sync
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            disabled={isSyncing}
          >
            <option value="">Choose a category...</option>
            {CATEGORIES.map(category => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sync Button */}
        <div>
          <button
            onClick={handleSync}
            disabled={!selectedCategory || isSyncing}
            className={`w-full py-2 px-4 rounded-md text-white font-medium
              ${!selectedCategory || isSyncing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
              } transition-colors`}
          >
            {isSyncing ? 'Syncing...' : 'Sync Environments'}
          </button>
        </div>

        {/* Result Message */}
        {syncResult && (
          <div className={`p-4 rounded-md ${
            syncResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {syncResult.message}
            {/* Revert button when backup is available */}
            {syncResult.backupFile && (
              <div className="mt-3">
                <button
                  onClick={handleRevert}
                  disabled={isSyncing}
                  className="py-1 px-3 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  {isSyncing ? 'Reverting...' : 'Revert last sync'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}