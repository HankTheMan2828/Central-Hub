import type { DocStoreState, WordDoc } from "./types";

const STORE_KEY = "word-docs-v2";
const BACKUP_KEY = "word-doc-backups-v1";
const LEGACY_KEY = "word-doc-v1";
const SNIPPET_LEN = 140;
const MAX_BACKUPS = 40;

type WordDocBackup = {
  id: string;
  docId: string;
  reason: string;
  doc: WordDoc;
  backedUpAt: number;
};

function emptyState(): DocStoreState {
  return { version: 2, activeId: null, docs: {} };
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function htmlToSnippet(html: string): string {
  if (typeof document === "undefined") return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const text = (tmp.innerText || tmp.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, SNIPPET_LEN);
}

export function loadStore(): DocStoreState {
  if (typeof window === "undefined") return emptyState();
  let state = emptyState();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2 && parsed.docs) {
        state = parsed as DocStoreState;
      }
    }
  } catch {
    // fall through to empty
  }

  // One-time migration from the legacy single-doc key.
  try {
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && typeof parsed.html === "string") {
        const id = makeId();
        const ts =
          typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
        const doc: WordDoc = {
          id,
          title:
            typeof parsed.title === "string" && parsed.title.trim()
              ? parsed.title
              : "Untitled document",
          html: parsed.html,
          pageColorId: "default",
          snippet: htmlToSnippet(parsed.html),
          createdAt: ts,
          updatedAt: ts,
        };
        state.docs[id] = doc;
        if (!state.activeId) state.activeId = id;
        window.localStorage.removeItem(LEGACY_KEY);
        saveStore(state);
      }
    }
  } catch {
    // ignore migration errors
  }

  return state;
}

export function saveStore(state: DocStoreState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Failed to save doc store:", err);
  }
}

export function backupDoc(doc: WordDoc, reason: string): void {
  if (typeof window === "undefined") return;
  if (!doc.html.trim()) return;
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    const backups = raw ? (JSON.parse(raw) as WordDocBackup[]) : [];
    const latest = backups[0];
    if (latest?.docId === doc.id && latest.doc.html === doc.html) return;
    const next: WordDocBackup[] = [
      {
        id: makeId(),
        docId: doc.id,
        reason,
        doc: { ...doc },
        backedUpAt: Date.now(),
      },
      ...backups,
    ].slice(0, MAX_BACKUPS);
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("Failed to back up doc:", err);
  }
}

export function getLatestBackupForDoc(docId: string): WordDoc | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    const backups = raw ? (JSON.parse(raw) as WordDocBackup[]) : [];
    return backups.find((backup) => backup.docId === docId)?.doc ?? null;
  } catch {
    return null;
  }
}

export function createDoc(
  state: DocStoreState,
  title = "Untitled document"
): { state: DocStoreState; doc: WordDoc } {
  const id = makeId();
  const now = Date.now();
  const doc: WordDoc = {
    id,
    title,
    html: "",
    pageLayoutId: "letter",
    pageColorId: "theme",
    snippet: "",
    createdAt: now,
    updatedAt: now,
  };
  const next: DocStoreState = {
    ...state,
    activeId: id,
    docs: { ...state.docs, [id]: doc },
  };
  return { state: next, doc };
}

export function updateDoc(
  state: DocStoreState,
  id: string,
  patch: Partial<Pick<WordDoc, "title" | "html" | "pageLayoutId" | "pageColorId">>
): DocStoreState {
  const existing = state.docs[id];
  if (!existing) return state;
  const html = patch.html ?? existing.html;
  const next: WordDoc = {
    ...existing,
    title: patch.title ?? existing.title,
    html,
    pageLayoutId: patch.pageLayoutId ?? existing.pageLayoutId,
    pageColorId: patch.pageColorId ?? existing.pageColorId,
    snippet:
      patch.html !== undefined ? htmlToSnippet(html) : existing.snippet,
    updatedAt: Date.now(),
  };
  return { ...state, docs: { ...state.docs, [id]: next } };
}

export function deleteDoc(state: DocStoreState, id: string): DocStoreState {
  if (!state.docs[id]) return state;
  const rest = { ...state.docs };
  delete rest[id];
  let activeId = state.activeId;
  if (activeId === id) {
    const remaining = Object.values(rest).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    activeId = remaining[0]?.id ?? null;
  }
  return { ...state, activeId, docs: rest };
}

export function duplicateDoc(
  state: DocStoreState,
  id: string
): DocStoreState {
  const orig = state.docs[id];
  if (!orig) return state;
  const newId = makeId();
  const now = Date.now();
  const copy: WordDoc = {
    ...orig,
    id: newId,
    title: `${orig.title} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...state,
    activeId: newId,
    docs: { ...state.docs, [newId]: copy },
  };
}

export function setActive(state: DocStoreState, id: string): DocStoreState {
  if (!state.docs[id]) return state;
  return { ...state, activeId: id };
}

export function listDocs(state: DocStoreState): WordDoc[] {
  return Object.values(state.docs).sort((a, b) => b.updatedAt - a.updatedAt);
}
