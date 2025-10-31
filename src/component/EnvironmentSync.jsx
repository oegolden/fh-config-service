import React, { useState } from 'react';

const ENVIRONMENTS = [
  { id: 'FH_API_KEY_STATUSBOARD_SANDBOX', label: 'Statusboard Sandbox' },
  { id: 'FH_API_KEY__SANDBOX', label: 'Sandbox' }
];

const CATEGORIES = [
  { id: 'teams', label: 'Teams' },
  { id: 'services', label: 'Services' },
  { id: 'functionalities', label: 'Functionalities' },
  { id: 'custom_fields/definitions', label: 'Settings' },
  { id: 'runbooks', label: 'Runbooks' },
  { id: 'incident_types', label: 'Incident Types' }
];

export default function EnvironmentSync() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sourceEnv, setSourceEnv] = useState('');
  const [targetEnv, setTargetEnv] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [backupInfo, setBackupInfo] = useState(null); // { exists, backups: [], category }
  const [selectedBackup, setSelectedBackup] = useState('');

  // Helper function to get environment display info
  const getEnvDisplayInfo = (envId) => {
    const env = ENVIRONMENTS.find(e => e.id === envId);
    return {
      label: env?.label || 'Unknown Environment',
      apiKey: envId,
      displayText: env ? `${env.label} (${envId})` : envId
    };
  };

  // Check available backups whenever category or target environment changes
  React.useEffect(() => {
    const checkBackups = async () => {
      if (!selectedCategory || !targetEnv) {
        setBackupInfo(null);
        setSelectedBackup('');
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:5000/api/sync/backups/${encodeURIComponent(selectedCategory)}/${targetEnv}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.backups && data.backups.length > 0) {
            // Find the category label for display
            const categoryLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory;
            setBackupInfo({
              exists: true,
              backups: data.backups,
              category: categoryLabel
            });
            // Auto-select the most recent backup
            const mostRecent = data.backups.reduce((latest, backup) => 
              new Date(backup.timestamp) > new Date(latest.timestamp) ? backup : latest
            );
            setSelectedBackup(mostRecent.filename);
          } else {
            setBackupInfo({ exists: false, backups: [] });
            setSelectedBackup('');
          }
        }
      } catch (err) {
        console.error('Error checking backups:', err);
        setBackupInfo(null);
        setSelectedBackup('');
      }
    };

    checkBackups();
  }, [selectedCategory, targetEnv]);

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
      // Make direct API call instead of using fh_functions
      const response = await fetch('http://localhost:5000/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: selectedCategory,
          sourceEnv,
          targetEnv,
          createBackup: true // Ensure backup is created on sync
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Sync failed');
      }

      const result = await response.json();
      const targetEnvInfo = getEnvDisplayInfo(targetEnv);
      
      setSyncResult({
        success: true,
        message: `Sync completed to ${targetEnvInfo.displayText}: ${result.results ? result.results.length + ' items processed' : 'done'}`,
        backupFile: result.backupFile
      });
      
      // Update backup status - re-check to get latest info
      const backupCheck = await fetch(
        `http://localhost:5000/api/sync/backups/${encodeURIComponent(selectedCategory)}/${targetEnv}`
      );
      if (backupCheck.ok) {
        const data = await backupCheck.json();
        if (data.backups && data.backups.length > 0) {
          const categoryLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory;
          setBackupInfo({
            exists: true,
            backups: data.backups,
            category: categoryLabel
          });
          // Auto-select the new backup (most recent)
          const mostRecent = data.backups.reduce((latest, backup) => 
            new Date(backup.timestamp) > new Date(latest.timestamp) ? backup : latest
          );
          setSelectedBackup(mostRecent.filename);
        }
      }
      
      // Dispatch event for EntityViewer to refresh
      try {
        window.dispatchEvent(new CustomEvent('fh-sync-complete', {
          detail: { 
            category: selectedCategory, 
            sourceEnv, 
            targetEnv, 
            backupFile: result.backupFile, 
            results: result.results 
          }
        }));
      } catch (e) {
        console.warn('Failed to dispatch fh-sync-complete event', e);
      }
    } catch (error) {
      const targetEnvInfo = getEnvDisplayInfo(targetEnv);
      setSyncResult({
        success: false,
        message: `Sync failed to ${targetEnvInfo.displayText}: ${error.message}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRevert = async () => {
    if (!selectedCategory || !targetEnv || !selectedBackup) {
      alert('Please ensure category, target environment, and backup are selected');
      return;
    }
    
    if (!backupInfo?.exists) {
      alert('No backups available for this category/environment');
      return;
    }

    const selectedBackupData = backupInfo.backups.find(backup => backup.filename === selectedBackup);
    if (!selectedBackupData) {
      alert('Selected backup not found');
      return;
    }

    const targetEnvInfo = getEnvDisplayInfo(targetEnv);
    const confirmMsg = `Are you sure you want to revert "${backupInfo.category}" in ${targetEnvInfo.displayText} to the selected backup?\n\n` +
      `Backup: ${selectedBackupData.filename}\n` +
      `Created: ${new Date(selectedBackupData.timestamp).toLocaleString()}\n` +
      `Items: ${selectedBackupData.itemCount}\n\n` +
      `⚠️ This will overwrite all current ${backupInfo.category} data in ${targetEnvInfo.displayText}`;
    
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsSyncing(true);
    try {
      console.log('🔄 Requesting revert from server...');
      
      const response = await fetch(`http://localhost:5000/api/sync/revert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          category: selectedCategory, 
          targetEnv,
          backupFile: selectedBackup
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Revert failed: ${errorText}`);
      }
      
      const result = await response.json();
      setSyncResult({ 
        success: true, 
        message: `✅ Revert completed for ${targetEnvInfo.displayText}: ${result.results ? result.results.length + ' items restored' : 'done'}` 
      });
      
      // Dispatch event for EntityViewer to refresh
      try {
        window.dispatchEvent(new CustomEvent('fh-sync-reverted', {
          detail: { 
            category: selectedCategory,
            targetEnv, 
            results: result.results 
          }
        }));
      } catch (e) {
        console.warn('Failed to dispatch fh-sync-reverted event', e);
      }
    } catch (err) {
      console.error('Revert error:', err);
      const targetEnvInfo = getEnvDisplayInfo(targetEnv);
      setSyncResult({ success: false, message: `❌ Revert failed for ${targetEnvInfo.displayText}: ${err.message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteBackup = async (backupFilename) => {
    if (!selectedCategory || !targetEnv || !backupFilename) {
      alert('Please ensure category and target environment are selected');
      return;
    }

    const targetEnvInfo = getEnvDisplayInfo(targetEnv);
    const backupToDelete = backupInfo.backups.find(backup => backup.filename === backupFilename);
    
    if (!backupToDelete) {
      alert('Backup not found');
      return;
    }

    const confirmMsg = `Are you sure you want to delete this backup?\n\n` +
      `Backup: ${backupToDelete.filename}\n` +
      `Created: ${new Date(backupToDelete.timestamp).toLocaleString()}\n` +
      `Items: ${backupToDelete.itemCount}\n\n` +
      `This action cannot be undone.`;
    
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/sync/backup/${encodeURIComponent(selectedCategory)}/${targetEnv}/${backupFilename}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Delete failed: ${errorText}`);
      }
      
      // Refresh backups list
      const backupCheck = await fetch(
        `http://localhost:5000/api/sync/backups/${encodeURIComponent(selectedCategory)}/${targetEnv}`
      );
      if (backupCheck.ok) {
        const data = await backupCheck.json();
        if (data.backups && data.backups.length > 0) {
          const categoryLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory;
          setBackupInfo({
            exists: true,
            backups: data.backups,
            category: categoryLabel
          });
          // Auto-select the most recent backup
          const mostRecent = data.backups.reduce((latest, backup) => 
            new Date(backup.timestamp) > new Date(latest.timestamp) ? backup : latest
          );
          setSelectedBackup(mostRecent.filename);
        } else {
          setBackupInfo({ exists: false, backups: [] });
          setSelectedBackup('');
        }
      }
      
      setSyncResult({ 
        success: true, 
        message: `✅ Backup deleted successfully` 
      });
    } catch (err) {
      console.error('Delete backup error:', err);
      setSyncResult({ success: false, message: `❌ Failed to delete backup: ${err.message}` });
    }
  };

  const targetEnvInfo = getEnvDisplayInfo(targetEnv);

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
                  {env.label} ({env.id})
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
                  {env.label} ({env.id})
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

        {/* Backup Management Section */}
        {selectedCategory && targetEnv && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-blue-700">
                Backup Management for "{CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory}" in {targetEnvInfo.displayText}
              </label>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {backupInfo?.backups?.length || 0} backup(s) stored
              </span>
            </div>

            {backupInfo?.exists && backupInfo.backups && backupInfo.backups.length > 0 ? (
              <>
                <select
                  value={selectedBackup}
                  onChange={(e) => setSelectedBackup(e.target.value)}
                  className="w-full p-2 border border-blue-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white mb-3"
                  disabled={isSyncing}
                >
                  <option value="">Select a backup to manage...</option>
                  {backupInfo.backups
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .map(backup => (
                      <option key={backup.filename} value={backup.filename}>
                        {new Date(backup.timestamp).toLocaleString()} - {backup.itemCount} items
                      </option>
                    ))
                  }
                </select>
                
                {/* Selected Backup Details and Actions */}
                {selectedBackup && (
                  <div className="mt-3 p-3 bg-white border border-blue-300 rounded-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="font-semibold text-blue-800 mb-1">Backup Details:</div>
                        <div className="text-blue-700 text-sm space-y-1">
                          <div><span className="font-medium">Filename:</span> {backupInfo.backups.find(b => b.filename === selectedBackup)?.filename}</div>
                          <div><span className="font-medium">Created:</span> {new Date(backupInfo.backups.find(b => b.filename === selectedBackup)?.timestamp).toLocaleString()}</div>
                          <div><span className="font-medium">Items:</span> {backupInfo.backups.find(b => b.filename === selectedBackup)?.itemCount}</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {/* Revert Button */}
                        <button
                          onClick={handleRevert}
                          disabled={isSyncing}
                          className={`w-full py-2 px-3 rounded-md text-white font-medium text-sm ${
                            isSyncing
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-red-600 hover:bg-red-700'
                          } transition-colors`}
                        >
                          {isSyncing ? 'Reverting...' : `Revert ${targetEnvInfo.label}`}
                        </button>
                        
                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteBackup(selectedBackup)}
                          disabled={isSyncing}
                          className="w-full py-2 px-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400 text-sm transition-colors"
                        >
                          Delete Backup
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-xs text-red-600 border-t border-red-200 pt-2">
                      ⚠️ Revert will overwrite current {backupInfo.category} data in {targetEnvInfo.displayText} with the selected backup
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600 p-3 bg-white border border-gray-200 rounded-md">
                No backups available yet. A new backup will be created when you sync.
              </div>
            )}
          </div>
        )}

        {/* Sync Button with Environment Info */}
        <div>
          <div className="mb-2 p-2 bg-indigo-50 border border-indigo-200 rounded-md">
            <div className="text-sm text-indigo-700">
              <strong>Sync Operation:</strong> {sourceEnv ? getEnvDisplayInfo(sourceEnv).displayText : 'Source'} → {targetEnv ? targetEnvInfo.displayText : 'Target'}
            </div>
            <div className="text-xs text-indigo-600 mt-1">
              A new backup will be created for {targetEnvInfo.displayText} before syncing
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={!selectedCategory || !sourceEnv || !targetEnv || isSyncing}
            className={`w-full py-2 px-4 rounded-md text-white font-medium
              ${!selectedCategory || !sourceEnv || !targetEnv || isSyncing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
              } transition-colors`}
          >
            {isSyncing ? 'Syncing...' : `Sync to ${targetEnvInfo.label}`}
          </button>
        </div>

        {/* Result Message */}
        {syncResult && (
          <div className={`p-4 rounded-md ${
            syncResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {syncResult.message}
          </div>
        )}
      </div>
    </div>
  );
}