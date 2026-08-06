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

export async function pickFolder(
  startPathOrOpts?:
    | string
    | {
        startPath?: string;
        title?: string;
        buttonLabel?: string;
        /** Default true for Docs Area; notes should pass false. */
        updateWorkingDir?: boolean;
      }
): Promise<string | null> {
  const opts =
    typeof startPathOrOpts === "string" || startPathOrOpts == null
      ? { startPath: startPathOrOpts, updateWorkingDir: true }
      : startPathOrOpts;
  const result = await invoke<{ path: string | null }>("docs:pick-folder", {
    startPath: opts.startPath,
    title: opts.title,
    buttonLabel: opts.buttonLabel,
  });
  if (result.path && opts.updateWorkingDir !== false) {
    await setWorkingDir(result.path);
  }
  return result.path;
}

export async function pickFile(
  startPath?: string
): Promise<{ path: string; parent: string } | null> {
  const result = await invoke<{ path: string | null; parent: string | null }>(
    "docs:pick-file",
    { startPath }
  );
  if (!result.path || !result.parent) return null;
  return { path: result.path, parent: result.parent };
}

/** Multi-select file picker (notes desktop, etc.). */
export async function pickFiles(options?: {
  startPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string[]> {
  const result = await invoke<{
    path: string | null;
    paths?: string[];
  }>("docs:pick-file", {
    startPath: options?.startPath,
    multi: true,
    filters: options?.filters,
  });
  if (Array.isArray(result.paths) && result.paths.length) return result.paths;
  if (result.path) return [result.path];
  return [];
}

export async function pickSavePath(options?: {
  startPath?: string;
  defaultName?: string;
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const result = await invoke<{ path: string | null }>("docs:pick-save", {
    startPath: options?.startPath,
    defaultName: options?.defaultName,
    title: options?.title,
    filters: options?.filters,
  });
  return result.path || null;
}

export async function writeFileText(
  path: string,
  content: string
): Promise<void> {
  await invoke("docs:write-text", { path, content });
}

export async function copyFile(from: string, to: string): Promise<string> {
  const result = await invoke<{ ok: true; path: string }>("docs:copy-file", {
    from,
    to,
  });
  return result.path;
}

export async function makeDir(path: string): Promise<string> {
  const result = await invoke<{ ok: true; path: string }>("docs:mkdir", {
    path,
  });
  return result.path;
}

export async function readFileText(path: string): Promise<string> {
  const result = await invoke<{
    success: boolean;
    content?: string;
    error?: string;
  }>("pi:read-file-text", { filePath: path });
  if (!result.success) {
    throw new Error(result.error || "File could not be read.");
  }
  return result.content ?? "";
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  if (typeof window === "undefined") {
    throw new Error("File reading is unavailable.");
  }
  try {
    const nodeRequire = (0, eval)("require") as (id: string) => unknown;
    const fs = nodeRequire("fs") as {
      readFileSync: (path: string) => Uint8Array;
    };
    const bytes = fs.readFileSync(path);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } catch {
    throw new Error("Binary file reading is unavailable.");
  }
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

export type DocLayoutSidecar = {
  pageLayoutId?: string;
  pageColorId?: string;
  orientation?: "portrait" | "landscape";
  marginsId?: string;
  columns?: 1 | 2 | 3;
  fontFamilyId?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  paragraphSpacingBeforePt?: number;
  paragraphSpacingAfterPt?: number;
};

export async function readDocLayout(
  path: string
): Promise<DocLayoutSidecar | null> {
  const result = await invoke<{ layout: DocLayoutSidecar | null }>(
    "docs:read-layout",
    { path }
  );
  return result.layout;
}

export async function writeDocLayout(
  path: string,
  layout: DocLayoutSidecar
): Promise<void> {
  await invoke<{ ok: boolean }>("docs:write-layout", { path, layout });
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
