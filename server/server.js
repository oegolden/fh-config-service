// server/server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import fs from 'fs';
import path from 'path';

import aws from 'aws-sdk';
import {
  GetObjectCommand,
  NoSuchKey,
  S3Client,
  S3ServiceException,
  DeleteObjectCommand,
  waitUntilObjectNotExists,
  paginateListObjectsV2,
} from "@aws-sdk/client-s3";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const API_BASE_URL = "https://api.firehydrant.io/v1";
const SOURCE_API_KEY = process.env.FH_API_KEY_STATUSBOARD_SANDBOX;
const TARGET_API_KEY = process.env.FH_API_KEY__SANDBOX;
// const BACKUP_DIR = path.join(process.cwd(), 'server', 'backups');
const S3 = new aws.S3({
  accessKeyId: process.env.S3_API_KEY,
  secretAccessKey: process.env.S3_API_SECRET,
  region: process.env.S3_REGION,
  signatureVersion: 'v4',
});
var bucketName = "ab-statusboard-test-us-west-1"

// Helper: Get backup filename for a category/environment pair with timestamp
function getBackupFilename(category, targetEnv, timestamp = null) {
  const ts = timestamp || Date.now();
  const safeCategory = category.replace(/[\/\\]/g, '_');
  const safeEnv = targetEnv.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${safeCategory}_${safeEnv}_${ts}.json`;
}

// Helper: Get all backup files for a category/environment
function getBackupFiles(category, targetEnv) {
  try {
    const safeCategory = category.replace(/[\/\\]/g, '_');
    const safeEnv = targetEnv.replace(/[^a-zA-Z0-9_]/g, '_');
    const prefix = `${safeCategory}_${safeEnv}_`;
    
    // if (!fs.existsSync(BACKUP_DIR)) {
    //   return [];
    // }
    const client = new S3Client({});
    /** @type {string[][]} */
    const files = [];
    const pageSize = 1000;
    try {
      const paginator = paginateListObjectsV2(
        { client, pageSize: Number.parseInt(pageSize) },
        { Bucket: bucketName },
      );
      (async () => {
      for await (const page of paginator) {
        files.push(page.Contents.map((o) => o.Key));
      }
      })();
    } catch (caught) {
      if (
        caught instanceof S3ServiceException &&
        caught.name === "NoSuchBucket"
      ) {
        console.error(
          `Error from S3 while listing objects for "${bucketName}". The bucket doesn't exist.`,
        );
      } else if (caught instanceof S3ServiceException) {
        console.error(
          `Error from S3 while listing objects for "${bucketName}".  ${caught.name}: ${caught.message}`,
        );
      } else {
        throw caught;
      }
    }
    files
      .filter(file => file.startsWith(prefix) && file.endsWith('.json'))
      .map(file => {
        // const filePath = path.join(BACKUP_DIR, file);
        try {
          S3.getObject(
            { Bucket: bucketName, Key: file},
            function (error, data) {
              if (error != null) {
                alert("Failed to retrieve an object: " + error);
              } else {
                const size = data.ContentLength
                const getReadableData = readable => {
                  return new Promise((resolve, reject) => {
                    const chunks = [];
                    readable.once('error', (err) => reject(err));
                    readable.on('data', (chunk) => chunks.push(chunk));
                    readable.once('end', () => resolve(chunks.join('')));
                  });
                };
                const promise = getReadableData(data.Body);
                promise.then(value => {
                  const content = JSON.parse(value);
                  return {
                    filename: file,
                    timestamp: content.timestamp,
                    itemCount: content.items?.length || 0,
                    size: size
                  };
                });
              }
            }
          );
        } catch (err) {
          console.error(`Error reading backup file ${file}:`, err);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first
    
    return files;
  } catch (err) {
    console.error('Error getting backup files:', err);
    return [];
  }
}

// Helper: Get specific backup file
function getBackupFile(category, targetEnv, filename) {
  try {
    S3.getObject(
            { Bucket: bucketName, Key: filename},
            function (error, data) {
              if (error != null) {
                alert("Failed to retrieve an object: " + error);
              } else {
                const size = data.ContentLength
                const getReadableData = readable => {
                  return new Promise((resolve, reject) => {
                    const chunks = [];
                    readable.once('error', (err) => reject(err));
                    readable.on('data', (chunk) => chunks.push(chunk));
                    readable.once('end', () => resolve(chunks.join('')));
                  });
                };
                const promise = getReadableData(data.Body);
                promise.then(value => {
                  const content = JSON.parse(value);
                  return {
                    filename,
                    timestamp: content.timestamp,
                    itemCount: content.items?.length || 0,
                    size: size,
                    items: content.items
                  };
                });
              }
            }
          );
  } catch (err) {
    console.error(`Error reading backup file ${filename}:`, err);
    return null;
  }
}

// Function to make API requests with specific key
async function makeApiRequest(endpoint, method, body, apiKey) {
  const url = `${API_BASE_URL}/${endpoint}`;
  const bodyText = body ? JSON.stringify(body) : null;
  const bodyPreview = bodyText ? (bodyText.length > 2000 ? bodyText.slice(0, 2000) + '...<truncated>' : bodyText) : null;
  console.log('Making API request:', {
    url,
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey.substring(0, 10) + "..."
    },
    bodyLength: bodyText ? bodyText.length : 0,
    bodyPreview
  });
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: bodyText || undefined,
  });
  
  if (!response.ok) {
    const responseText = await response.text();
    console.error('API Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText,
      requestBody: bodyPreview
    });
    throw new Error(`API error (${response.status}): ${response.statusText}\nResponse: ${responseText}\nRequest body: ${bodyPreview || '<empty>'}`);
  }
  const responseText = await response.text();
  // Some endpoints (DELETE) may return empty body; handle that gracefully
  if (!responseText || responseText.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse JSON response:', responseText);
    throw new Error('Invalid JSON response from API');
  }
}

// Helper: stable key for matching items (name/title/display_name/id/field_id)
function itemKey(item) {
  if (!item) return '';
  return (item.name || item.title || item.display_name || item.id || item.field_id || '').toString();
}

// Helper: pick id to use in endpoint path (id or field_id)
function itemIdentifier(item) {
  if (!item) return null;
  return item.id || item.field_id || null;
}

// Helper: sanitize data for creation in new environment
function sanitizeForSync(data, category) {
  // Deep clone to avoid mutating original
  const clean = JSON.parse(JSON.stringify(data || {}));
  console.log('Sanitizing data for category:', category, 'Input fields:', Object.keys(clean));

  // Recursively remove nested 'id' fields except 'action_id'
  function stripIds(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripIds);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      // For runbooks, preserve more fields
      if (category === 'runbooks') {
        if (k === 'action_id' || k === 'name' || k === 'summary' || k === 'description' || 
            k === 'type' || k === 'categories' || k === 'steps' || k === 'tasks' ||
            k === 'content' || k === 'task_type') {
          out[k] = stripIds(v);
          continue;
        }
        // Skip only specific timestamps and refs for runbooks
        if (k === 'created_at' || k === 'updated_at' || k === 'last_executed_at' || 
            k === 'last_executed_for_incident' || k === 'owner' || k === 'attachment_rule' ||
            k === 'id' || k === 'field_id') {
          continue;
        }
        // Keep any other fields we don't explicitly know about
        out[k] = stripIds(v);
      } else {
        // Original logic for non-runbook items
        if (k === 'action_id') {
          out[k] = v; // preserve action_id
          continue;
        }
        if (k === 'id' || k === 'field_id' || k === 'created_at' || k === 'updated_at' || 
            k === 'last_executed_at' || k === 'last_executed_for_incident') {
          continue;
        }
        if (k === 'owner' || k === 'attachment_rule') continue;
        out[k] = stripIds(v);
      }
    }
    return out;
  }

  const stripped = stripIds(clean);

  // Category-specific adjustments
  if (category === 'incident_types' && stripped.template) {
    if (stripped.template.runbook_ids) stripped.template.runbook_ids = [];
    if (stripped.template.team_ids) stripped.template.team_ids = [];
    if (stripped.template.impacts) stripped.template.impacts = [];
    if (stripped.template.custom_fields) stripped.template.custom_fields = [];
    if (stripped.template_values) {
      stripped.template_values = {
        services: [],
        functionalities: [],
        environments: [],
        runbooks: {},
        teams: []
      };
    }
  }

  if (category === 'runbooks') {
    console.log('Processing runbook:', stripped.name, 'Steps before:', stripped.steps?.length || 0);
    
    // Keep existing steps if present, only create default if missing
    if (!Array.isArray(stripped.steps) || stripped.steps.length === 0) {
      stripped.steps = [{
        action_id: 'initial_step',
        name: 'Initial Step',
        type: 'manual',
        tasks: [{ action_id: 'initial_task', name: 'Manual Task', type: 'markdown', content: 'Add your task details here' }]
      }];
    } else {
      // Preserve existing steps but ensure action_ids exist
      stripped.steps = stripped.steps.map((step, si) => {
        const s = { ...step };
        if (!s.action_id) s.action_id = `step_${si}`;
        if (!Array.isArray(s.tasks)) s.tasks = [];
        s.tasks = s.tasks.map((task, ti) => {
          const t = { ...task };
          if (!t.action_id) t.action_id = `task_${si}_${ti}`;
          // Preserve all task fields except refs
          delete t.record_id;
          delete t.runbook_id;
          return t;
        });
        return s;
      });
    }
    
    // Set default manual attachment rule if missing or has external dependencies
    if (!stripped.attachment_rule || 
        (stripped.attachment_rule.logic && (
          stripped.attachment_rule.logic.services?.length ||
          stripped.attachment_rule.logic.teams?.length ||
          stripped.attachment_rule.logic.functionalities?.length
        ))) {
      stripped.attachment_rule = {
        logic: { type: 'manual' },
        user_data: {}
      };
    }
    
    // Remove external references
    delete stripped.owner;
    delete stripped.last_executed_for_incident;
    
    console.log('Processed runbook:', {
      name: stripped.name,
      stepsAfter: stripped.steps?.length || 0,
      fields: Object.keys(stripped)
    });
  }

  return stripped;
}

// POST /api/sync -> perform sync (creates new backup with timestamp)
app.post("/api/sync", async (req, res) => {
  const { category, sourceEnv, targetEnv } = req.body;
  if (!category || !sourceEnv || !targetEnv) {
    return res.status(400).json({ error: "Category, source, and target environments are required" });
  }

  console.log('Sync request:', { category, sourceEnv, targetEnv });
  const sourceKey = process.env[sourceEnv];
  const targetKey = process.env[targetEnv];
  if (!sourceKey || !targetKey) {
    return res.status(400).json({ error: "Invalid environment keys" });
  }

  try {
    // Fetch source and target items
    const sourceResponse = await fetch(`${API_BASE_URL}/${category}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sourceKey}` }
    });
    if (!sourceResponse.ok) throw new Error(`Source fetch failed: ${sourceResponse.status} ${sourceResponse.statusText}`);
    const sourceDataRaw = await sourceResponse.json();
    const items = Array.isArray(sourceDataRaw) ? sourceDataRaw : (sourceDataRaw.data || []);

    const targetResponse = await fetch(`${API_BASE_URL}/${category}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetKey}` }
    });
    if (!targetResponse.ok) throw new Error(`Target fetch failed: ${targetResponse.status} ${targetResponse.statusText}`);
    const targetDataRaw = await targetResponse.json();
    const tItems = Array.isArray(targetDataRaw) ? targetDataRaw : (targetDataRaw.data || []);

    // Save backup of target items (creates new backup with timestamp)
    const timestamp = Date.now();
    const backupPayload = { 
      category, 
      targetEnv, 
      timestamp,
      items: tItems 
    };
    const backupFilename = getBackupFilename(category, targetEnv, timestamp);
    // const backupPath = path.join(BACKUP_DIR, backupFilename);
    // await fs.promises.writeFile(backupPath, JSON.stringify(backupPayload, null, 2));
    await S3.putObject({
      Bucket: bucketName,
      Key: backupFilename,
      Body: backupPayload,
      ContentType: 'application/json'
    });
    console.log(`✅ Saved backup to: ${bucketName} (${tItems.length} items)`);

    // First identify and delete items that exist in target but not in source
    const sourceKeys = new Set(items.map(it => itemKey(it)));
    const toDelete = tItems.filter(t => !sourceKeys.has(itemKey(t)));
    
    const results = [];
    
    if (toDelete.length) {
      console.log(`Will delete ${toDelete.length} items from target that don't exist in source`);
      for (const delItem of toDelete) {
        try {
          const delId = itemIdentifier(delItem);
          if (delId) {
            await makeApiRequest(`${category}/${delId}`, 'DELETE', null, targetKey);
            results.push({ name: itemKey(delItem), action: 'deleted' });
          } else {
            console.warn('Skipping delete for item without identifier', delItem);
            results.push({ name: itemKey(delItem), action: 'delete_skipped', error: 'no id/field_id' });
          }
        } catch (err) {
          console.error('Failed to delete item', { item: delItem, err: err.message });
          results.push({ name: itemKey(delItem), action: 'delete_failed', error: err.message });
        }
      }
    }

    // Then create/update items from source
    for (const sourceItem of items) {
      const targetItem = tItems.find(t => itemKey(t) === itemKey(sourceItem));
      try {
        const targetId = itemIdentifier(targetItem);
        
        // Special handling for runbooks - fetch full details before sync
        if (category === 'runbooks') {
          console.log(`Fetching full runbook details for ${itemKey(sourceItem)}`);
          // Get full source runbook details
          const sourceId = itemIdentifier(sourceItem);
          const fullSourceRunbook = await makeApiRequest(`runbooks/${sourceId}`, 'GET', null, sourceKey);
          console.log(`Got full source runbook details for ${itemKey(sourceItem)}:`, {
            name: fullSourceRunbook.name,
            steps: fullSourceRunbook.steps?.length || 0,
            fields: Object.keys(fullSourceRunbook)
          });
          
          if (targetItem && targetId) {
            // Update existing runbook
            const sanitizedData = sanitizeForSync(fullSourceRunbook, category);
            await makeApiRequest(`${category}/${targetId}`, 'PATCH', sanitizedData, targetKey);
            results.push({ name: itemKey(sourceItem), action: 'updated' });
          } else {
            // Create new runbook with full details
            const sanitizedData = sanitizeForSync(fullSourceRunbook, category);
            await makeApiRequest(category, 'POST', sanitizedData, targetKey);
            results.push({ name: itemKey(sourceItem), action: 'created' });
          }
        } else {
          // Regular sync for non-runbook items
          if (targetItem && targetId) {
            // PATCH existing item by its identifier - sanitize but preserve existing IDs
            const sanitizedData = sanitizeForSync(sourceItem, category);
            await makeApiRequest(`${category}/${targetId}`, 'PATCH', sanitizedData, targetKey);
            results.push({ name: itemKey(sourceItem), action: 'updated' });
          } else {
            // No usable id on target -> create a new item with clean data
            const sanitizedData = sanitizeForSync(sourceItem, category);
            await makeApiRequest(category, 'POST', sanitizedData, targetKey);
            results.push({ name: itemKey(sourceItem), action: 'created' });
          }
        }
      } catch (err) {
        console.error('Sync item error', { item: sourceItem, err: err.message });
        results.push({ name: itemKey(sourceItem), action: 'failed', error: err.message });
      }
    }

    res.json({ success: true, results, backupFile: backupFilename });
  } catch (err) {
    console.error('Sync error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all backups for a category/environment: GET /api/sync/backups/:category/:targetEnv
app.get('/api/sync/backups/:category/:targetEnv', async (req, res) => {
  try {
    const { category, targetEnv } = req.params;
    const backups = getBackupFiles(category, targetEnv);
    
    if (backups.length > 0) {
      res.json({ 
        exists: true,
        backups: backups.map(backup => ({
          filename: backup.filename,
          timestamp: backup.timestamp,
          itemCount: backup.itemCount,
          size: backup.size
        }))
      });
    } else {
      res.json({ exists: false, backups: [] });
    }
  } catch (err) {
    console.error('Get backups error', err);
    res.status(500).json({ error: err.message });
  }
});

// Get specific backup: GET /api/sync/backup/:category/:targetEnv/:filename
app.get('/api/sync/backup/:category/:targetEnv/:filename', async (req, res) => {
  try {
    const { category, targetEnv, filename } = req.params;
    const backup = getBackupFile(category, targetEnv, filename);
    
    if (backup) {
      res.json({ 
        exists: true,
        filename: backup.filename,
        timestamp: backup.timestamp,
        itemCount: backup.itemCount,
        size: backup.size
      });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error('Get backup error', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete specific backup: DELETE /api/sync/backup/:category/:targetEnv/:filename
app.delete('/api/sync/backup/:category/:targetEnv/:filename', async (req, res) => {
  try {
    const { category, targetEnv, filename } = req.params;

    S3.deleteObject(
      {  
        Bucket: bucketName, 
        Key: filename 
      }, 
      function(err, data) {
      if (err) {
        console.log(err, err.stack);
      }
      else{
        console.log(`🗑️ Deleted backup: ${filename}`);
      }
    });
  } catch (err) {
    console.error('Delete backup error', err);
    res.status(500).json({ error: err.message });
  }
});

// Revert using specific backup: POST /api/sync/revert
app.post('/api/sync/revert', async (req, res) => {
  const { category, targetEnv, backupFile } = req.body;
  if (!category || !targetEnv || !backupFile) {
    return res.status(400).json({ error: 'category, targetEnv, and backupFile are required' });
  }
  
  const targetKey = process.env[targetEnv];
  if (!targetKey) {
    return res.status(400).json({ error: 'Invalid targetEnv' });
  }

  try {
    const backup = getBackupFile(category, targetEnv, backupFile);
    
    if (!backup) {
      throw new Error(`Backup file ${backupFile} not found for ${category} in ${targetEnv}`);
    }

    const { items } = backup;
    
    console.log(`🔄 Reverting ${category} in ${targetEnv} to backup ${backupFile} with ${items.length} items`);

    // Fetch current target items to find ids
    const targetResponse = await fetch(`${API_BASE_URL}/${category}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${targetKey}` }
    });
    if (!targetResponse.ok) throw new Error(`Target fetch failed: ${targetResponse.status} ${targetResponse.statusText}`);
    const targetDataRaw = await targetResponse.json();
    const tItems = Array.isArray(targetDataRaw) ? targetDataRaw : (targetDataRaw.data || []);
    const results = [];

    // Identify items that exist in target but not in backup -> delete them to restore exact snapshot
    const backupKeys = new Set(items.map(it => itemKey(it)));
    const toDelete = tItems.filter(t => !backupKeys.has(itemKey(t)));
    if (toDelete.length) console.log(`Will delete ${toDelete.length} items from target to match backup.`);
    for (const delItem of toDelete) {
      try {
        const delId = itemIdentifier(delItem);
        if (delId) {
          await makeApiRequest(`${category}/${delId}`, 'DELETE', null, targetKey);
          results.push({ name: itemKey(delItem), action: 'deleted' });
        } else {
          console.warn('Skipping delete for item without identifier', delItem);
          results.push({ name: itemKey(delItem), action: 'delete_skipped', error: 'no id/field_id' });
        }
      } catch (err) {
        console.error('Failed to delete item during revert', { item: delItem, err: err.message });
        results.push({ name: itemKey(delItem), action: 'delete_failed', error: err.message });
      }
    }
    
    // Restore items from backup
    for (const backupItem of items) {
      const { id, ...itemData } = backupItem;
      const targetItem = tItems.find(t => itemKey(t) === itemKey(backupItem));
      try {
        const targetId = itemIdentifier(targetItem);
        if (targetItem && targetId) {
          await makeApiRequest(`${category}/${targetId}`, 'PATCH', itemData, targetKey);
          results.push({ name: itemKey(backupItem), action: 'restored' });
        } else {
          await makeApiRequest(category, 'POST', itemData, targetKey);
          results.push({ name: itemKey(backupItem), action: 'created' });
        }
      } catch (err) {
        console.error('Revert item error', { item: backupItem, err: err.message });
        results.push({ name: itemKey(backupItem), action: 'failed', error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Revert error', err);
    res.status(500).json({ error: err.message });
  }
});

// Generic proxy function for other requests
app.use("/api", async (req, res) => {
  const method = req.method;
  const body = req.body;
  const targetPath = req.originalUrl.replace(/^\/api/, "");
  try {
    // Determine API key: prefer Authorization header containing env var name
    let apiKeyToUse = SOURCE_API_KEY;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const envKeyName = authHeader.replace('Bearer ', '').trim();
      const envKey = process.env[envKeyName];
      if (envKey) {
        apiKeyToUse = envKey;
      } else {
        console.warn(`Authorization header provided but env var ${envKeyName} not found; falling back to SOURCE_API_KEY`);
      }
    }

    const data = await makeApiRequest(
      targetPath.replace(/^\//, ""),
      method,
      body && Object.keys(body).length ? body : null,
      apiKeyToUse
    );
    res.json(data);
  } catch (err) {
    console.error('Proxy error', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log("Proxy server running on port 5000"));