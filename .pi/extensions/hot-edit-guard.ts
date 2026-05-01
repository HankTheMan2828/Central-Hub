/**
 * Hot-Edit Guard — PI extension that protects the app from self-inflicted
 * damage when PI edits critical files (main.js, package.json, extensions).
 *
 * Layers:
 *  1. Git safety checkpoint on dedicated ai-safety-rollbacks branch
 *  2. Syntax validation (node --check) before accepting changes
 *  3. Guarded restart with external watchdog process
 *  4. Auto-rollback if the app crashes after an edit
 *
 * Place this file in .pi/extensions/ for auto-discovery.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";

/* ------------------------------------------------------------------ */
/*  Configuration — files & dirs that trigger the safety net          */
/* ------------------------------------------------------------------ */
const CRITICAL_FILES = new Set([
  "main.js",
  "package.json",
  "tsconfig.json",
  "next.config.ts",
]);

const CRITICAL_DIRS = [
  ".pi" + path.sep + "extensions",
  // Cover frontend/main/*.js — extracted from the original main.js refactor.
  path.sep + "main" + path.sep,
];

/* ------------------------------------------------------------------ */
/*  Extension state                                                    */
/* ------------------------------------------------------------------ */
let editedCriticalFiles = new Set<string>();
let lastSafetyHash: string | null = null;
let isRestartScheduled = false;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Resolve a potentially-relative tool path against PI's cwd */
function resolvePath(toolPath: string, cwd: string): string {
  if (path.isAbsolute(toolPath)) return toolPath;
  return path.resolve(cwd, toolPath);
}

/** Is this file one we need to protect? */
function isCritical(filePath: string): boolean {
  const base = path.basename(filePath);
  if (CRITICAL_FILES.has(base)) return true;

  const normalized = filePath.replace(/\\/g, "/");
  for (const dir of CRITICAL_DIRS) {
    if (normalized.includes(dir.replace(/\\/g, "/"))) return true;
  }
  return false;
}

/** Run a git command, return { code, stdout, stderr }. Non-throwing. */
async function git(
  pi: ExtensionAPI,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await pi.exec("git", args, { timeout: 15_000 });
    return { code: result.code ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (e: any) {
    return { code: 1, stdout: "", stderr: e.message ?? String(e) };
  }
}

/** Get the current git branch name (empty string if detached/unknown) */
async function currentBranch(pi: ExtensionAPI): Promise<string> {
  const { stdout } = await git(pi, ["branch", "--show-current"]);
  return stdout.trim();
}

/**
 * Layer 1 — Save a safety checkpoint on the ai-safety-rollbacks branch.
 * Does NOT touch the working branch. Returns the commit hash.
 */
async function createSafetyCheckpoint(
  pi: ExtensionAPI,
  reason: string,
): Promise<string | null> {
  const branch = await currentBranch(pi);

  // Stash any uncommitted work so we can move branches cleanly
  let didStash = false;
  const { stdout: stashOut } = await git(pi, ["stash", "push", "-m", "hot-edit: temp stash before checkpoint"]);
  if (!stashOut.includes("No local changes")) didStash = true;

  // Switch to (or create) the safety branch — -B resets it to current HEAD
  let { code } = await git(pi, ["checkout", "-B", "ai-safety-rollbacks"]);
  if (code !== 0) {
    // If we can't switch branches (e.g. first commit not yet done), just note the HEAD
    const { stdout } = await git(pi, ["rev-parse", "HEAD"]);
    lastSafetyHash = stdout.trim();
    // Try to restore
    if (branch) await git(pi, ["checkout", branch]);
    if (didStash) await git(pi, ["stash", "pop"]);
    return lastSafetyHash;
  }

  // Pop the stash onto the safety branch so the checkpoint includes current work
  if (didStash) {
    await git(pi, ["stash", "pop"]);
  }

  // Commit everything as a safety point
  await git(pi, ["add", "-A"]);
  const { stdout: commitOut } = await git(pi, [
    "commit",
    "--allow-empty",
    "-m", `🔒 ai-safety: ${reason}`,
  ]);

  // Extract commit hash
  const hashMatch = commitOut.match(/\[ai-safety-rollbacks\s+([a-f0-9]+)\]/);
  const hash = hashMatch ? hashMatch[1] : (await git(pi, ["rev-parse", "HEAD"])).stdout.trim();

  // Switch back to the original branch
  if (branch) {
    await git(pi, ["checkout", branch]);
  } else {
    await git(pi, ["checkout", "-"]); // back to wherever we were
  }

  console.log(`[hot-edit-guard] Safety checkpoint: ${hash.slice(0, 7)} — ${reason}`);
  return hash;
}

/**
 * Layer 2 — Syntax-validate a JS/TS file with node --check.
 * Returns null if OK, error string if broken.
 */
async function syntaxCheck(
  pi: ExtensionAPI,
  filePath: string,
): Promise<string | null> {
  if (!/\.(js|ts|mjs|cjs)$/.test(filePath)) return null;

  const { code, stderr } = await pi.exec("node", ["--check", filePath], { timeout: 10_000 });

  if (code !== 0) {
    const msg = stderr || `Exited with code ${code}`;
    console.error(`[hot-edit-guard] Syntax error in ${filePath}:`, msg);
    return msg;
  }
  return null;
}

/**
 * Write the watchdog state file so the external watchdog knows what to
 * roll back if the restart crashes.
 */
function writeWatchdogState(
  cwd: string,
  safetyHash: string | null,
  files: string[],
): string {
  const statePath = path.join(cwd, ".pi", "watchdog.json");

  // Capture the original launch args so the watchdog can relaunch identically
  const state = {
    safetyHash: safetyHash || "",
    files,
    timestamp: Date.now(),
    cwd,
    // process.argv for Electron: [electron.exe, main.js, ...args]
    launchArgv: process.argv,
    // The git repo root (where to run git rollback commands)
    gitRoot: cwd,
  };

  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log("[hot-edit-guard] Watchdog state written:", statePath);
  return statePath;
}

/**
 * Layer 3 — Guarded restart.
 * Spawns the external watchdog, then tells Electron to relaunch + exit.
 */
function guardedRestart(cwd: string) {
  if (isRestartScheduled) return;
  isRestartScheduled = true;

  const watchdogScript = path.join(cwd, "scripts", "watchdog.js");

  if (!fs.existsSync(watchdogScript)) {
    console.warn("[hot-edit-guard] Watchdog script not found at", watchdogScript);
    console.warn("[hot-edit-guard] Doing unguarded restart — fingers crossed.");
    const { app } = require("electron");
    app.relaunch();
    app.exit(0);
    return;
  }

  // Spawn watchdog detached so it survives the Electron exit
  const child = spawn("node", [watchdogScript], {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d: Buffer) => console.log("[watchdog]", d.toString().trim()));
  child.stderr?.on("data", (d: Buffer) => console.error("[watchdog:err]", d.toString().trim()));
  child.unref();

  console.log("[hot-edit-guard] Watchdog spawned. Relaunching Electron...");

  // Give the watchdog a moment to initialize, then restart
  setTimeout(() => {
    const { app } = require("electron");
    app.relaunch();
    app.exit(0);
  }, 1500);
}

/* ------------------------------------------------------------------ */
/*  Extension entry point                                             */
/* ------------------------------------------------------------------ */

export default function (pi: ExtensionAPI) {
  console.log("[hot-edit-guard] Loaded — protecting critical files");

  /* ================================================================== */
  /*  Layer 1 — Before a write/edit to a critical file, checkpoint      */
  /* ================================================================== */
  pi.on("tool_call", async (event, ctx) => {
    // Only intercept write and edit tools
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    let filePath = "";

    // Extract the target path (write uses .path, edit uses .file_path or .path)
    if (isToolCallEventType("write", event)) {
      filePath = (event.input as any).path ?? "";
    } else if (isToolCallEventType("edit", event)) {
      filePath = (event.input as any).file_path ?? (event.input as any).path ?? "";
    }

    if (!filePath) return;

    const resolved = resolvePath(filePath, ctx.cwd);

    if (!isCritical(resolved)) return;

    console.log(`[hot-edit-guard] Critical file edit detected: ${resolved}`);

    // Create safety checkpoint BEFORE the tool executes
    lastSafetyHash = await createSafetyCheckpoint(
      pi,
      `pre-edit checkpoint — ${path.basename(resolved)}`,
    );

    ctx.ui.notify(
      `🔒 Safety checkpoint saved for ${path.basename(resolved)}`,
      "info",
    );
  });

  /* ================================================================== */
  /*  Layer 2 — After a write/edit, validate syntax                      */
  /* ================================================================== */
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    if (event.isError) return; // don't validate failed tool calls

    let filePath = "";
    if (event.toolName === "write") {
      filePath = (event.input as any).path ?? "";
    } else if (event.toolName === "edit") {
      filePath = (event.input as any).file_path ?? (event.input as any).path ?? "";
    }
    if (!filePath) return;

    const resolved = resolvePath(filePath, ctx.cwd);

    if (!isCritical(resolved)) return;

    // Track that we edited this file
    editedCriticalFiles.add(resolved);

    // Syntax check
    const syntaxError = await syntaxCheck(pi, resolved);
    if (syntaxError) {
      ctx.ui.notify(
        `⚠️ Syntax error in ${path.basename(resolved)}\n${syntaxError.slice(0, 200)}`,
        "error",
      );
    } else {
      ctx.ui.notify(`✅ ${path.basename(resolved)} — syntax OK`, "success");
    }
  });

  /* ================================================================== */
  /*  Layers 3+4 — When the agent finishes, schedule guarded restart     */
  /* ================================================================== */
  pi.on("agent_end", async (_event, ctx) => {
    if (editedCriticalFiles.size === 0) return;
    if (isRestartScheduled) return;

    const files = Array.from(editedCriticalFiles);
    const names = files.map((f) => path.basename(f)).join(", ");

    console.log(`[hot-edit-guard] Critical files edited: ${names}`);

    // Write the watchdog state file
    writeWatchdogState(ctx.cwd, lastSafetyHash, files);

    ctx.ui.notify(
      `🔄 Restarting to apply changes to: ${names}\nSafety net is active — will roll back on crash.`,
      "info",
    );

    // Schedule the guarded restart (small delay so the notification renders)
    setTimeout(() => {
      guardedRestart(ctx.cwd);
    }, 2000);
  });

  /* ================================================================== */
  /*  Slash commands for manual control                                  */
  /* ================================================================== */

  pi.registerCommand("hot-edit:restart", {
    description: "Restart the app with safety watchdog",
    handler: async (_args, ctx) => {
      writeWatchdogState(ctx.cwd, lastSafetyHash, Array.from(editedCriticalFiles));
      ctx.ui.notify("🔄 Restarting with safety net…", "info");
      setTimeout(() => guardedRestart(ctx.cwd), 1000);
    },
  });

  pi.registerCommand("hot-edit:rollback", {
    description: "Roll back to the last safety checkpoint",
    handler: async (_args, ctx) => {
      if (!lastSafetyHash) {
        ctx.ui.notify("No safety checkpoint available to roll back to.", "warning");
        return;
      }

      // Restore critical files from safety branch
      const fileArgs = Array.from(editedCriticalFiles);
      if (fileArgs.length > 0) {
        const { code, stderr } = await git(pi, [
          "checkout", "ai-safety-rollbacks", "--", ...fileArgs,
        ]);
        if (code !== 0) {
          ctx.ui.notify(`Rollback failed: ${stderr}`, "error");
          return;
        }
      }

      ctx.ui.notify(
        `⏪ Rolled back to safety checkpoint ${lastSafetyHash.slice(0, 7)}`,
        "success",
      );
      editedCriticalFiles.clear();
    },
  });
}