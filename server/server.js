// server/server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import fs from 'fs';
import path from 'path';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const API_BASE_URL = "https://api.firehydrant.io/v1";
const SOURCE_API_KEY = process.env.FH_API_KEY_STATUSBOARD_SANDBOX;
const TARGET_API_KEY = process.env.FH_API_KEY__SANDBOX;
const BACKUP_DIR = path.join(process.cwd(), 'server', 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Function to make API requests with specific key
async function makeApiRequest(endpoint, method, body, apiKey) {
  const url = `${API_BASE_URL}/${endpoint}`;
  console.log('Making API request:', {
    url,
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey.substring(0, 10) + "..."
    },
    bodyLength: body ? JSON.stringify(body).length : 0
  });
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const responseText = await response.text();
    console.error('API Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText
    });
    throw new Error(`API error (${response.status}): ${response.statusText}\nResponse: ${responseText}`);
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

// Sync endpoints and backup/revert functionality (must be before the general proxy)
// POST /api/sync -> perform sync (creates a backup of target before mutating)
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

    // Save backup of target items
    const backupPayload = { category, targetEnv, timestamp: Date.now(), items: tItems };
    const backupFile = `${category.replace(/[\/\\]/g, '_')}_${targetEnv}_${Date.now()}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFile);
    await fs.promises.writeFile(backupPath, JSON.stringify(backupPayload, null, 2));
    console.log('Saved backup to', backupPath);

    // Perform sync (create/patch)
    const results = [];
    for (const sourceItem of items) {
      const { id, ...itemData } = sourceItem;
      const targetItem = tItems.find(t => itemKey(t) === itemKey(sourceItem));
      try {
        const targetId = itemIdentifier(targetItem);
        if (targetItem && targetId) {
          // PATCH existing item by its identifier
          await makeApiRequest(`${category}/${targetId}`, 'PATCH', itemData, targetKey);
          results.push({ name: itemKey(sourceItem), action: 'updated' });
        } else {
          // No usable id on target -> create a new item
          await makeApiRequest(category, 'POST', itemData, targetKey);
          results.push({ name: itemKey(sourceItem), action: 'created' });
        }
      } catch (err) {
        console.error('Sync item error', { item: sourceItem, err: err.message });
        results.push({ name: itemKey(sourceItem), action: 'failed', error: err.message });
      }
    }

    res.json({ success: true, results, backupFile });
  } catch (err) {
    console.error('Sync error', err);
    res.status(500).json({ error: err.message });
  }
});

// List backups
app.get('/api/sync/backups', async (req, res) => {
  try {
    const files = await fs.promises.readdir(BACKUP_DIR);
    const list = await Promise.all(files.map(async (f) => {
      const stat = await fs.promises.stat(path.join(BACKUP_DIR, f));
      return { file: f, size: stat.size, mtime: stat.mtimeMs };
    }));
    list.sort((a, b) => b.mtime - a.mtime);
    res.json({ backups: list });
  } catch (err) {
    console.error('List backups error', err);
    res.status(500).json({ error: err.message });
  }
});

// Revert a backup: POST /api/sync/revert { backupFile, targetEnv }
app.post('/api/sync/revert', async (req, res) => {
  const { backupFile, targetEnv } = req.body;
  if (!backupFile || !targetEnv) return res.status(400).json({ error: 'backupFile and targetEnv are required' });
  const backupPath = path.join(BACKUP_DIR, backupFile);
  if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup not found' });

  const targetKey = process.env[targetEnv];
  if (!targetKey) return res.status(400).json({ error: 'Invalid targetEnv' });

  try {
    const raw = await fs.promises.readFile(backupPath, 'utf8');
    const { category, items } = JSON.parse(raw);

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
          // No identifier to delete by; report as skipped
          console.warn('Skipping delete for item without identifier', delItem);
          results.push({ name: itemKey(delItem), action: 'delete_skipped', error: 'no id/field_id' });
        }
      } catch (err) {
        console.error('Failed to delete item during revert', { item: delItem, err: err.message });
        results.push({ name: itemKey(delItem), action: 'delete_failed', error: err.message });
      }
    }
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
