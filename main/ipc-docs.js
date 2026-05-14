/* ------------------------------------------------------------------ */
/*  Docs Area filesystem storage.                                     */
/*                                                                    */
/*  IPC channels handled here:                                        */
/*    - docs:browse                                                   */
/*    - docs:get-working-dir                                          */
/*    - docs:set-working-dir                                          */
/*    - docs:pick-folder                                              */
/*    - docs:read                                                     */
/*    - docs:write                                                    */
/*    - docs:create                                                   */
/*    - docs:delete                                                   */
/*    - docs:duplicate                                                */
/*    - docs:backup-write                                             */
/*    - docs:backup-list                                              */
/*    - docs:backup-read                                              */
/*    - docs:reveal                                                   */
/*    - docs:open-in-os                                               */
/*    - docs:make-folder                                              */
/*    - docs:migrate                                                  */
/* ------------------------------------------------------------------ */

const { app, dialog, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const DOC_ID_RE = /__([^\\/]+)\.json$/i;
const writeQueues = new Map();

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultWorkingDir() {
  return path.join(app.getPath('documents'), 'CentralHub', 'Docs');
}

function slugTitle(title) {
  const slug = String(title || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'untitled';
}

function filenameForDoc(doc) {
  return `${slugTitle(doc.title)}__${doc.id}.json`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return fs.realpath(dir);
}

async function ensureWorkingDir(dir) {
  const real = await ensureDir(dir || defaultWorkingDir());
  const probe = path.join(real, `.permcheck-${Date.now()}`);
  await fs.writeFile(probe, 'ok', 'utf8');
  await fs.unlink(probe);
  return real;
}

async function atomicWriteJson(filePath, value) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

function enqueue(filePath, task) {
  const key = path.resolve(filePath);
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  writeQueues.set(key, next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  }));
  return next;
}

function isWordDoc(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.html === 'string'
  );
}

function makeDoc(title = 'Untitled document') {
  const now = Date.now();
  return {
    id: makeId(),
    title,
    html: '',
    pageLayoutId: 'letter',
    pageColorId: 'theme',
    snippet: '',
    createdAt: now,
    updatedAt: now,
  };
}

async function readJsonDoc(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isWordDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function countDocs(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      const doc = await readJsonDoc(path.join(dir, entry.name));
      if (doc) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

async function browseDir(inputPath) {
  const real = await ensureDir(inputPath || defaultWorkingDir());
  const entries = await fs.readdir(real, { withFileTypes: true });
  const folders = [];
  const docs = [];
  const others = [];

  for (const entry of entries) {
    if (entry.name === '.backups') continue;
    const entryPath = path.join(real, entry.name);
    const stat = await fs.stat(entryPath);
    if (entry.isDirectory()) {
      folders.push({
        name: entry.name,
        path: entryPath,
        docCount: await countDocs(entryPath),
        updatedAt: stat.mtimeMs,
      });
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.toLowerCase().endsWith('.json')) {
      const doc = await readJsonDoc(entryPath);
      if (doc) {
        const { html, ...meta } = doc;
        docs.push({ ...meta, path: entryPath, size: stat.size });
        continue;
      }
    }
    others.push({
      name: entry.name,
      path: entryPath,
      size: stat.size,
      updatedAt: stat.mtimeMs,
      ext: path.extname(entry.name).toLowerCase(),
    });
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  docs.sort((a, b) => b.updatedAt - a.updatedAt);
  others.sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(real);
  return { path: real, parent: parent === real ? null : parent, folders, docs, others };
}

async function writeDoc(doc, oldPath) {
  if (!isWordDoc(doc)) throw new Error('Invalid document payload.');
  const baseDir = oldPath ? path.dirname(oldPath) : defaultWorkingDir();
  const finalPath = path.join(baseDir, filenameForDoc(doc));
  const nextDoc = { ...doc, updatedAt: Date.now() };
  await enqueue(finalPath, async () => {
    await atomicWriteJson(finalPath, nextDoc);
    if (oldPath && path.resolve(oldPath) !== path.resolve(finalPath)) {
      try {
        await fs.unlink(oldPath);
      } catch (_) {}
    }
  });
  return { ok: true, path: finalPath };
}

async function backupPathFor(docPath, doc, reason) {
  const safeReason = String(reason || 'backup').replace(/[^a-z0-9-]+/gi, '-').slice(0, 40);
  const dir = path.join(path.dirname(docPath), '.backups', doc.id);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${Date.now()}__${safeReason || 'backup'}.json`);
}

function register(ipcMain) {
  ipcMain.handle('docs:get-working-dir', async () => {
    const real = await ensureWorkingDir(defaultWorkingDir());
    return { path: real, defaultPath: real };
  });

  ipcMain.handle('docs:set-working-dir', async (_event, { path: dirPath }) => {
    const real = await ensureWorkingDir(dirPath);
    return { ok: true, path: real };
  });

  ipcMain.handle('docs:pick-folder', async (_event, { startPath } = {}) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: startPath || defaultWorkingDir(),
    });
    return { path: result.canceled ? null : result.filePaths[0] || null };
  });

  ipcMain.handle('docs:browse', async (_event, { path: dirPath } = {}) => {
    return browseDir(dirPath);
  });

  ipcMain.handle('docs:read', async (_event, { path: docPath }) => {
    return { doc: await readJsonDoc(docPath), path: docPath };
  });

  ipcMain.handle('docs:write', async (_event, { doc, path: docPath }) => {
    return writeDoc(doc, docPath);
  });

  ipcMain.handle('docs:create', async (_event, { folder, title } = {}) => {
    const dir = await ensureWorkingDir(folder || defaultWorkingDir());
    const doc = makeDoc(title);
    const docPath = path.join(dir, filenameForDoc(doc));
    await atomicWriteJson(docPath, doc);
    return { doc, path: docPath };
  });

  ipcMain.handle('docs:delete', async (_event, { path: docPath }) => {
    const dir = path.join(path.dirname(docPath), '.backups', 'deleted');
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, `${Date.now()}__${path.basename(docPath)}`);
    await fs.rename(docPath, dest);
    return { ok: true };
  });

  ipcMain.handle('docs:duplicate', async (_event, { path: docPath }) => {
    const original = await readJsonDoc(docPath);
    if (!original) throw new Error('Document could not be read.');
    const now = Date.now();
    const doc = {
      ...original,
      id: makeId(),
      title: `${original.title} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    const target = path.join(path.dirname(docPath), filenameForDoc(doc));
    await atomicWriteJson(target, doc);
    return { doc, path: target };
  });

  ipcMain.handle('docs:backup-write', async (_event, { doc, path: docPath, reason }) => {
    if (!isWordDoc(doc) || !doc.html.trim()) return { ok: true };
    const target = await backupPathFor(docPath, doc, reason);
    await atomicWriteJson(target, { ...doc, backedUpAt: Date.now(), backupReason: reason });
    return { ok: true };
  });

  ipcMain.handle('docs:backup-list', async (_event, { path: docPath }) => {
    const doc = await readJsonDoc(docPath);
    if (!doc) return { backups: [] };
    const dir = path.join(path.dirname(docPath), '.backups', doc.id);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const backups = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => {
          const fullPath = path.join(dir, entry.name);
          const [ts, reasonPart = 'backup.json'] = entry.name.split('__');
          return {
            reason: reasonPart.replace(/\.json$/i, ''),
            backedUpAt: Number(ts) || 0,
            path: fullPath,
          };
        })
        .sort((a, b) => b.backedUpAt - a.backedUpAt);
      return { backups };
    } catch {
      return { backups: [] };
    }
  });

  ipcMain.handle('docs:backup-read', async (_event, { backupPath }) => {
    return { doc: await readJsonDoc(backupPath) };
  });

  ipcMain.handle('docs:reveal', async (_event, { path: target }) => {
    shell.showItemInFolder(target);
    return { ok: true };
  });

  ipcMain.handle('docs:open-in-os', async (_event, { path: target }) => {
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true };
  });

  ipcMain.handle('docs:make-folder', async (_event, { parent, name }) => {
    const safeName = String(name || '').replace(/[<>:"/\\|?*]+/g, '').trim();
    if (!safeName) throw new Error('Folder name is required.');
    const dir = path.join(parent, safeName);
    await fs.mkdir(dir, { recursive: false });
    return { path: dir };
  });

  ipcMain.handle('docs:migrate', async (_event, { store, backups } = {}) => {
    const dir = await ensureWorkingDir(defaultWorkingDir());
    const docs = store && store.docs ? Object.values(store.docs) : [];
    let count = 0;
    for (const doc of docs) {
      if (!isWordDoc(doc)) continue;
      const target = path.join(dir, filenameForDoc(doc));
      try {
        await fs.access(target);
      } catch {
        await atomicWriteJson(target, doc);
        count++;
      }
    }
    if (Array.isArray(backups)) {
      for (const backup of backups) {
        const doc = backup && backup.doc;
        if (!isWordDoc(doc)) continue;
        const docPath = path.join(dir, filenameForDoc(doc));
        const target = await backupPathFor(docPath, doc, backup.reason || 'legacy');
        await atomicWriteJson(target, doc);
      }
    }
    return { count, path: dir };
  });
}

module.exports = { register };
