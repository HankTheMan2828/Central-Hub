import type { BackupEntry, BrowseResult, WordDoc } from "./types";

const WORKING_DIR_KEY = "word-working-dir";
const ACTIVE_DOC_PATH_KEY = "word-active-doc-path";
const LEGACY_STORE_KEY = "word-docs-v2";
const LEGACY_BACKUP_KEY = "word-doc-backups-v1";

type IpcRendererLike = {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
};

function getIpc(): IpcRendererLike | null {
  if (typeof window === "undefined") return null;
  try {
    return (0, eval)("require")("electron").ipcRenderer as IpcRendererLike;
  } catch {
    return null;
  }
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const ipc = getIpc();
  if (!ipc) throw new Error("Docs filesystem IPC is unavailable.");
  return (await ipc.invoke(channel, payload)) as T;
}

export function getActiveDocPath(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_DOC_PATH_KEY);
}

export function setActiveDocPath(path: string | null): void {
  if (typeof window === "undefined") return;
  if (path) {
    window.localStorage.setItem(ACTIVE_DOC_PATH_KEY, path);
  } else {
    window.localStorage.removeItem(ACTIVE_DOC_PATH_KEY);
  }
}

export async function getWorkingDir(): Promise<string> {
  const stored =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(WORKING_DIR_KEY);
  if (stored) return stored;
  const result = await invoke<{ path: string; defaultPath: string }>(
    "docs:get-working-dir",
    {}
  );
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKING_DIR_KEY, result.path);
  }
  return result.path;
}

export async function setWorkingDir(path: string): Promise<void> {
  const result = await invoke<{ ok: true; path: string }>("docs:set-working-dir", {
    path,
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKING_DIR_KEY, result.path);
  }
}

export async function pickFolder(startPath?: string): Promise<string | null> {
  const result = await invoke<{ path: string | null }>("docs:pick-folder", {
    startPath,
  });
  if (result.path) await setWorkingDir(result.path);
  return result.path;
}

export async function browse(path?: string): Promise<BrowseResult> {
  return invoke<BrowseResult>("docs:browse", { path });
}

export async function readDoc(
  path: string
): Promise<{ doc: WordDoc | null; path: string }> {
  return invoke<{ doc: WordDoc | null; path: string }>("docs:read", { path });
}

export async function writeDoc(
  doc: WordDoc,
  path: string
): Promise<{ path: string }> {
  return invoke<{ ok: true; path: string }>("docs:write", { doc, path });
}

export async function createDoc(
  folder: string,
  title = "Untitled document"
): Promise<{ doc: WordDoc; path: string }> {
  return invoke<{ doc: WordDoc; path: string }>("docs:create", { folder, title });
}

export async function deleteDoc(path: string): Promise<void> {
  await invoke<{ ok: true }>("docs:delete", { path });
}

export async function duplicateDoc(
  path: string
): Promise<{ doc: WordDoc; path: string }> {
  return invoke<{ doc: WordDoc; path: string }>("docs:duplicate", { path });
}

export async function backupDoc(
  doc: WordDoc,
  path: string,
  reason: string
): Promise<void> {
  await invoke<{ ok: true }>("docs:backup-write", { doc, path, reason });
}

export async function listBackups(path: string): Promise<BackupEntry[]> {
  const result = await invoke<{ backups: BackupEntry[] }>("docs:backup-list", {
    path,
  });
  return result.backups;
}

export async function readBackup(path: string): Promise<WordDoc | null> {
  const result = await invoke<{ doc: WordDoc | null }>("docs:backup-read", {
    backupPath: path,
  });
  return result.doc;
}

export async function reveal(path: string): Promise<void> {
  await invoke<{ ok: true }>("docs:reveal", { path });
}

export async function openInOs(path: string): Promise<void> {
  await invoke<{ ok: true }>("docs:open-in-os", { path });
}

export async function makeFolder(parent: string, name: string): Promise<string> {
  const result = await invoke<{ path: string }>("docs:make-folder", {
    parent,
    name,
  });
  return result.path;
}

export function loadLegacyDocStore(): unknown | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function migrateLegacyDocs(): Promise<{ count: number; path: string }> {
  const store = loadLegacyDocStore();
  if (!store) return { count: 0, path: await getWorkingDir() };
  const backups =
    typeof window === "undefined"
      ? []
      : JSON.parse(window.localStorage.getItem(LEGACY_BACKUP_KEY) || "[]");
  const result = await invoke<{ count: number; path: string }>("docs:migrate", {
    store,
    backups,
  });
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_STORE_KEY);
    window.localStorage.removeItem(LEGACY_BACKUP_KEY);
    window.localStorage.setItem(WORKING_DIR_KEY, result.path);
  }
  return result;
}
