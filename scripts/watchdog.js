/**
 * Watchdog — external safety net for hot-editing CentralHub.
 *
 * Spawned by the hot-edit-guard extension before Electron restarts.
 * Runs as a detached child process — survives the Electron exit.
 *
 * Flow:
 *  1. Read .pi/watchdog.json (written by hot-edit-guard before restart)
 *  2. Wait up to WATCHDOG_TIMEOUT_MS for the new Electron process to
 *     acknowledge it started successfully (by writing "acknowledged: true"
 *     into the watchdog state file).
 *  3. If acknowledged → cleanup and exit. Success.
 *  4. If timeout expires with no acknowledgment → the new process
 *     crashed or failed to start → git rollback to safety checkpoint,
 *     relaunch Electron, exit.
 *
 * This script does NOT import anything from PI or Electron.
 * It's pure Node.js — runs even if the entire app is broken.
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */
const WATCHDOG_TIMEOUT_MS = 20_000;  // how long to wait for new process
const POLL_INTERVAL_MS = 500;        // check every 500ms

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[watchdog ${ts}] ${msg}`);
}

/** Read and parse the watchdog state file */
function readState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Write updated state back to the file */
function writeState(statePath, state) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (e) {
    log(`Failed to write state: ${e.message}`);
  }
}

/** Run a git command synchronously (throws on failure) */
function git(args, cwd) {
  log(`git ${args.join(" ")}`);
  try {
    const out = execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf-8",
      timeout: 30_000,
    });
    return out.trim();
  } catch (e) {
    log(`git failed: ${e.stderr || e.message}`);
    throw e;
  }
}

/** Relaunch Electron using the same command that originally launched it */
function relaunchElectron(launchArgv, cwd) {
  if (!launchArgv || launchArgv.length < 2) {
    log("No launch args available — cannot relaunch");
    return;
  }

  const [executable, ...args] = launchArgv;
  log(`Relaunching: ${executable} ${args.join(" ")}`);

  spawn(executable, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    shell: process.platform === "win32", // needed on Windows for .cmd/.bat
  }).unref();
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  // The watchdog is spawned from the frontend directory
  const cwd = process.cwd();
  const statePath = path.join(cwd, ".pi", "watchdog.json");

  log(`Starting — cwd: ${cwd}`);
  log(`State file: ${statePath}`);

  const state = readState(statePath);
  if (!state) {
    log("No watchdog state file found — nothing to guard. Exiting.");
    process.exit(0);
  }

  log(`Safety hash: ${(state.safetyHash || "none").slice(0, 7)}`);
  log(`Files guarded: ${(state.files || []).join(", ") || "none"}`);

  const startTime = Date.now();

  // Poll until the new Electron process acknowledges, or we time out
  let acknowledged = false;

  while (Date.now() - startTime < WATCHDOG_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const current = readState(statePath);
    if (!current) {
      // State file disappeared — maybe the new process deleted it after ack?
      // Check if maybe the file was just temporarily unreadable
      log("State file disappeared — treating as acknowledged");
      acknowledged = true;
      break;
    }

    if (current.acknowledged === true) {
      log("New process acknowledged — app is alive!");
      acknowledged = true;
      break;
    }
  }

  if (acknowledged) {
    // Success! Clean up the state file and exit
    try {
      fs.unlinkSync(statePath);
      log("State file cleaned up. Exiting.");
    } catch {
      log("Could not delete state file (may already be gone). Exiting.");
    }
    process.exit(0);
  }

  // Timeout — the new process never acknowledged. Rollback.
  log(`Timeout after ${WATCHDOG_TIMEOUT_MS / 1000}s — new process never acknowledged.`);
  log("ROLLING BACK to safety checkpoint...");

  try {
    const files = state.files || [];
    const safetyHash = state.safetyHash;
    const gitRoot = state.gitRoot || cwd;

    if (!files.length && !safetyHash) {
      log("No files or safety hash to roll back — nothing to do.");
    } else {
      // Restore files from the safety branch
      if (safetyHash) {
        // Restore from the safety branch
        git(`checkout ai-safety-rollbacks -- ${files.join(" ")}`.split(" ").filter(Boolean), gitRoot);
        log("Files restored from ai-safety-rollbacks branch.");
      } else {
        log("No safety hash, trying git checkout of safety branch files...");
        const branchFiles = files.join(" ");
        git(`checkout ai-safety-rollbacks -- ${branchFiles}`.split(" ").filter(Boolean), gitRoot);
      }
    }

    // Clean up state file
    try { fs.unlinkSync(statePath); } catch {}

    // Relaunch Electron with the rolled-back code
    if (state.launchArgv && state.launchArgv.length > 1) {
      log("Relaunching Electron with rolled-back code...");
      relaunchElectron(state.launchArgv, cwd);
    } else {
      log("No launch args — cannot auto-relaunch.");
      log("Please restart the app manually:");
      log("  npm run app:dev");
    }

  } catch (e) {
    log(`Rollback failed: ${e.message}`);
    log("MANUAL RECOVERY REQUIRED:");
    log("  git checkout ai-safety-rollbacks -- main.js");
    log("  npm run app:dev");
  }

  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  log(`Fatal: ${e.message}`);
  process.exit(1);
});