#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const LABEL_NAME = "Auto-settle restored";
const LABEL_COLOR = "#ff2bd6";
const DEFAULT_LABEL_ID = "label-auto-settle-restored";
const DEFAULT_STATE_DIR = NodePath.resolve(NodeOS.homedir(), ".t3", "userdata");

function usage() {
  process.stdout.write(
    `Usage: node scripts/${NodePath.basename(import.meta.filename)} [--apply] [--state-dir <path>]\n\n`,
  );
  process.stdout.write(
    "Dry-runs by default. --apply refuses to edit the production renderer state while T3 Code Alpha is running.\n",
  );
}

function parseArgs(argv) {
  let apply = false;
  let stateDir = DEFAULT_STATE_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--state-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--state-dir requires a path");
      stateDir = NodePath.resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { apply, stateDir };
}

function isProductionT3Running() {
  try {
    // execFileSync does not involve a shell, so this broad fixed path cannot
    // match the migration process itself. Matching helpers is intentional:
    // any live production renderer can flush an older UI-state snapshot.
    NodeChildProcess.execFileSync("pgrep", ["-f", "/Applications/T3 Code"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function queryAutoSettledThreadIds(databasePath) {
  const sql = [
    "SELECT DISTINCT stream_id",
    "FROM orchestration_events INDEXED BY idx_orch_events_command_id",
    "WHERE command_id >= 'server:auto-settle:'",
    "  AND command_id < 'server:auto-settle;'",
    "ORDER BY stream_id;",
  ].join("\n");
  const output = NodeChildProcess.execFileSync("sqlite3", ["-readonly", databasePath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return output
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function chooseLabelId(labels) {
  const occupiedIds = new Set(labels.map((label) => label?.id).filter(Boolean));
  if (!occupiedIds.has(DEFAULT_LABEL_ID)) return DEFAULT_LABEL_ID;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${DEFAULT_LABEL_ID}-${suffix}`;
    if (!occupiedIds.has(candidate)) return candidate;
  }
}

function applyLabel(state, threadKeys) {
  const labels = Array.isArray(state.threadLabels) ? [...state.threadLabels] : [];
  const existingIndex = labels.findIndex(
    (label) =>
      typeof label?.name === "string" &&
      label.name.trim().toLocaleLowerCase() === LABEL_NAME.toLocaleLowerCase(),
  );
  const labelId = existingIndex >= 0 ? labels[existingIndex].id : chooseLabelId(labels);
  if (existingIndex >= 0) {
    labels[existingIndex] = { ...labels[existingIndex], name: LABEL_NAME, color: LABEL_COLOR };
  } else {
    labels.push({ id: labelId, name: LABEL_NAME, color: LABEL_COLOR });
  }

  const assignments =
    state.threadLabelIdsByThreadKey && typeof state.threadLabelIdsByThreadKey === "object"
      ? { ...state.threadLabelIdsByThreadKey }
      : {};
  let assignmentsAdded = 0;
  for (const threadKey of threadKeys) {
    const current = Array.isArray(assignments[threadKey]) ? assignments[threadKey] : [];
    if (!current.includes(labelId)) {
      assignments[threadKey] = [...current, labelId];
      assignmentsAdded += 1;
    }
  }

  return {
    state: { ...state, threadLabels: labels, threadLabelIdsByThreadKey: assignments },
    labelId,
    assignmentsAdded,
  };
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, "");
}

function main() {
  const { apply, stateDir } = parseArgs(process.argv.slice(2));
  const databasePath = NodePath.join(stateDir, "state.sqlite");
  const environmentIdPath = NodePath.join(stateDir, "environment-id");
  const uiStatePath = NodePath.join(stateDir, "renderer-state", "ui-state.json");
  const environmentId = NodeFS.readFileSync(environmentIdPath, "utf8").trim();
  if (!environmentId) throw new Error(`Empty environment id: ${environmentIdPath}`);

  const threadIds = queryAutoSettledThreadIds(databasePath);
  if (threadIds.length === 0)
    throw new Error(
      "No server:auto-settle: events were found; refusing to create an empty recovery label.",
    );
  const threadKeys = threadIds.map((threadId) => `${environmentId}:${threadId}`);
  const uiState = JSON.parse(NodeFS.readFileSync(uiStatePath, "utf8"));
  const migrated = applyLabel(uiState, threadKeys);

  const summary = {
    mode: apply ? "applied" : "dry-run",
    stateDir,
    uiStatePath,
    label: { id: migrated.labelId, name: LABEL_NAME, color: LABEL_COLOR },
    autoSettledThreads: threadIds.length,
    assignmentsAdded: migrated.assignmentsAdded,
  };
  if (!apply) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (stateDir === DEFAULT_STATE_DIR && isProductionT3Running()) {
    throw new Error(
      "T3 Code Alpha is running. Quit it cleanly, then rerun this command so its renderer cannot overwrite the label migration.",
    );
  }

  const backupsDir = NodePath.join(stateDir, "backups");
  NodeFS.mkdirSync(backupsDir, { recursive: true });
  const backupPath = NodePath.join(
    backupsDir,
    `ui-state-before-auto-settle-label-${timestampForFileName()}-${process.pid}.json`,
  );
  NodeFS.copyFileSync(uiStatePath, backupPath, NodeFS.constants.COPYFILE_EXCL);

  const originalMode = NodeFS.statSync(uiStatePath).mode;
  const temporaryPath = `${uiStatePath}.${process.pid}.tmp`;
  try {
    NodeFS.writeFileSync(temporaryPath, JSON.stringify(migrated.state), {
      encoding: "utf8",
      flag: "wx",
    });
    NodeFS.chmodSync(temporaryPath, originalMode);
    NodeFS.renameSync(temporaryPath, uiStatePath);
  } finally {
    NodeFS.rmSync(temporaryPath, { force: true });
  }

  const verified = JSON.parse(NodeFS.readFileSync(uiStatePath, "utf8"));
  const assignedCount = threadKeys.filter((threadKey) =>
    verified.threadLabelIdsByThreadKey?.[threadKey]?.includes(migrated.labelId),
  ).length;
  if (assignedCount !== threadIds.length) {
    throw new Error(
      `Post-write verification failed: expected ${threadIds.length} assignments, found ${assignedCount}. Backup: ${backupPath}`,
    );
  }
  process.stdout.write(
    `${JSON.stringify({ ...summary, backupPath, verifiedAssignments: assignedCount }, null, 2)}\n`,
  );
}

main();
