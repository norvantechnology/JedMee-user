#!/usr/bin/env node
/**
 * migrate.js — JedMee DB Migration Runner
 *
 * Usage:
 *   node migrate.js <stage> [options]
 *   npm run migrate:local
 *   npm run migrate:dev
 *   npm run migrate:prod
 *
 * Options:
 *   --seeds          Also run files in sql/seeds/ after migrations
 *   --dry-run        Show pending files without executing them
 *   --force <file>   Re-run a specific file even if already applied
 *                    (e.g. --force 003_app_users.sql)
 *
 * Tracking table (auto-created):
 *   schema_migrations (id, filename, checksum, applied_at, execution_ms)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { Client } = require('pg');

// ─── ANSI colours ────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m',
};
const ok    = (s) => `${C.green}✔${C.reset} ${s}`;
const skip  = (s) => `${C.gray}–${C.reset} ${C.dim}${s}${C.reset}`;
const warn  = (s) => `${C.yellow}⚠${C.reset} ${s}`;
const err   = (s) => `${C.red}✖${C.reset} ${s}`;
const info  = (s) => `${C.cyan}ℹ${C.reset} ${s}`;
const head  = (s) => `\n${C.bold}${C.blue}${s}${C.reset}`;

// ─── CLI argument parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2); // strip 'node migrate.js'
  const opts = {
    stage:    null,
    seeds:    false,
    dryRun:   false,
    force:    null,   // filename to force-rerun
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--seeds')    { opts.seeds  = true; continue; }
    if (a === '--dry-run')  { opts.dryRun = true; continue; }
    if (a === '--force')    { opts.force  = args[++i]; continue; }
    if (!a.startsWith('--')) { opts.stage = a; }
  }

  return opts;
}

// ─── Load DB config from template.yaml ───────────────────────────────────────
// AWS SAM templates use CloudFormation intrinsic tags (!Ref, !FindInMap, !Sub,
// !If, !Select, !Join, !GetAtt …) that are not valid standard YAML.
// We build a permissive schema that silently accepts every unknown tag so
// js-yaml can parse the file without throwing.
function buildSamSchema() {
  // Create a catch-all type that accepts any tag in any style
  const cfnTag = new yaml.Type('!', {
    kind: 'scalar',
    multi: true,          // match ALL tags starting with '!'
    resolve: () => true,
    construct: (data) => data,
  });

  // Explicit list of known CF tags (scalar + sequence + mapping forms)
  const tagNames = [
    '!Ref', '!Sub', '!If', '!Not', '!And', '!Or', '!Equals',
    '!Select', '!Split', '!Join', '!Base64', '!Cidr',
    '!GetAtt', '!GetAZs', '!ImportValue', '!Transform',
    '!FindInMap', '!Condition',
  ];

  const types = [];
  for (const tag of tagNames) {
    for (const kind of ['scalar', 'sequence', 'mapping']) {
      types.push(new yaml.Type(tag, {
        kind,
        construct: (data) => ({ [tag]: data }),
      }));
    }
  }

  return yaml.DEFAULT_SCHEMA.extend(types);
}

function loadDbConfig(stage) {
  const templatePath = path.join(__dirname, 'template.yaml');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`template.yaml not found at: ${templatePath}`);
  }

  const raw  = fs.readFileSync(templatePath, 'utf8');
  const doc  = yaml.load(raw, { schema: buildSamSchema() });

  const mappings = doc?.Mappings?.StageConfig;
  if (!mappings) throw new Error('template.yaml: Mappings.StageConfig not found');

  const allowed = Object.keys(mappings);
  if (!allowed.includes(stage)) {
    throw new Error(
      `Unknown stage "${stage}". Allowed: ${allowed.join(', ')}`
    );
  }

  const cfg = mappings[stage];
  return {
    host:     cfg.DbHost,
    port:     parseInt(cfg.DbPort, 10) || 5432,
    database: cfg.DbName,
    user:     cfg.DbUser,
    password: cfg.DbPassword,
    ssl:      cfg.DbSsl === 'disable' ? false : { rejectUnauthorized: false },
  };
}

// ─── Ensure tracking table exists ────────────────────────────────────────────
async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id            SERIAL PRIMARY KEY,
      filename      TEXT        NOT NULL UNIQUE,
      checksum      TEXT        NOT NULL,
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms  INTEGER
    );
  `);
}

// ─── Fetch already-applied filenames ─────────────────────────────────────────
async function appliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY applied_at'
  );
  // Map: filename → { checksum, applied_at }
  return new Map(rows.map(r => [r.filename, r]));
}

// ─── Collect SQL files from a directory, sorted numerically ──────────────────
function collectSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      // Sort by leading numeric prefix (e.g. 001, 002 …)
      const numA = parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10);
      const numB = parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10);
      return numA - numB || a.localeCompare(b);
    })
    .map(f => ({ filename: f, fullPath: path.join(dir, f) }));
}

// ─── SHA-256 checksum of file content ────────────────────────────────────────
function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// ─── Run a single SQL file inside a transaction ───────────────────────────────
async function runFile(client, filename, fullPath, dryRun) {
  const sql = fs.readFileSync(fullPath, 'utf8');
  const cs  = checksum(sql);

  if (dryRun) {
    console.log(warn(`[DRY-RUN] would apply: ${filename}  (sha256: ${cs.slice(0, 12)}…)`));
    return { skipped: false, dryRun: true };
  }

  const t0 = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(sql);
    const ms = Date.now() - t0;
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, execution_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (filename) DO UPDATE
         SET checksum = EXCLUDED.checksum,
             applied_at = NOW(),
             execution_ms = EXCLUDED.execution_ms`,
      [filename, cs, ms]
    );
    await client.query('COMMIT');
    return { ms, checksum: cs };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

// ─── Pretty-print the applied-migrations table ───────────────────────────────
function printStatus(applied) {
  if (applied.size === 0) {
    console.log(info('No migrations have been applied yet.'));
    return;
  }
  console.log(head('Applied migrations:'));
  for (const [filename, meta] of applied) {
    const ts = new Date(meta.applied_at).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`  ${C.green}✔${C.reset} ${filename.padEnd(55)} ${C.gray}${ts}${C.reset}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  // ── Validate stage ──────────────────────────────────────────────────────────
  if (!opts.stage) {
    console.error(err('Usage: node migrate.js <stage> [--seeds] [--dry-run] [--force <file>]'));
    console.error(err('Stages: local | dev | prod'));
    process.exit(1);
  }

  console.log(head(`JedMee DB Migration Runner`));
  console.log(info(`Stage    : ${C.bold}${opts.stage}${C.reset}`));
  console.log(info(`Seeds    : ${opts.seeds   ? 'yes' : 'no'}`));
  console.log(info(`Dry-run  : ${opts.dryRun  ? 'yes' : 'no'}`));
  if (opts.force) console.log(warn(`Force    : ${opts.force}`));

  // ── Load config ─────────────────────────────────────────────────────────────
  let dbCfg;
  try {
    dbCfg = loadDbConfig(opts.stage);
  } catch (e) {
    console.error(err(e.message));
    process.exit(1);
  }

  console.log(info(`DB       : ${dbCfg.user}@${dbCfg.host}:${dbCfg.port}/${dbCfg.database}`));

  // ── Connect ─────────────────────────────────────────────────────────────────
  const client = new Client(dbCfg);
  try {
    process.stdout.write(info('Connecting … '));
    await client.connect();
    console.log(`${C.green}connected${C.reset}`);
  } catch (e) {
    console.error('');
    console.error(err(`Connection failed: ${e.message}`));
    process.exit(1);
  }

  try {
    // ── Ensure tracking table ──────────────────────────────────────────────────
    await ensureTrackingTable(client);

    // ── Collect files ──────────────────────────────────────────────────────────
    const sqlRoot      = path.join(__dirname, 'sql');
    const migrationDir = path.join(sqlRoot, 'migrations');
    const seedDir      = path.join(sqlRoot, 'seeds');

    const migrationFiles = collectSqlFiles(migrationDir);
    const seedFiles      = opts.seeds ? collectSqlFiles(seedDir) : [];
    const allFiles       = [
      ...migrationFiles.map(f => ({ ...f, type: 'migration' })),
      ...seedFiles.map(f => ({ ...f, type: 'seed' })),
    ];

    if (allFiles.length === 0) {
      console.log(warn('No SQL files found.'));
      return;
    }

    // ── Fetch applied set ──────────────────────────────────────────────────────
    const applied = await appliedMigrations(client);
    printStatus(applied);

    // ── Determine pending files ────────────────────────────────────────────────
    const pending = allFiles.filter(f => {
      if (opts.force && f.filename === opts.force) return true; // always include forced
      return !applied.has(f.filename);
    });

    console.log(head(`Pending (${pending.length} of ${allFiles.length}):`));

    if (pending.length === 0) {
      console.log(info('Nothing to run — database is up to date.'));
      return;
    }

    // ── Run pending files ──────────────────────────────────────────────────────
    let successCount = 0;
    let failCount    = 0;

    for (const file of pending) {
      const label = `[${file.type}] ${file.filename}`;
      process.stdout.write(`  ${C.cyan}▶${C.reset} ${label.padEnd(60)}`);

      try {
        const result = await runFile(client, file.filename, file.fullPath, opts.dryRun);
        if (result.dryRun) {
          // already printed inside runFile
        } else {
          console.log(`${C.green}done${C.reset} ${C.gray}(${result.ms}ms)${C.reset}`);
          successCount++;
        }
      } catch (e) {
        console.log(`${C.red}FAILED${C.reset}`);
        console.error(err(`  ${e.message}`));
        failCount++;
        // Stop on first failure to preserve DB integrity
        console.error(err('Stopping — fix the error above and re-run.'));
        break;
      }
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    console.log(head('Summary:'));
    if (!opts.dryRun) {
      console.log(info(`  Applied  : ${C.green}${successCount}${C.reset}`));
      if (failCount > 0) {
        console.log(info(`  Failed   : ${C.red}${failCount}${C.reset}`));
      }
      console.log(info(`  Skipped  : ${applied.size}`));
    } else {
      console.log(info(`  Would run: ${pending.length} file(s)`));
    }

  } finally {
    await client.end();
    console.log(info('Connection closed.\n'));
  }
}

main().catch(e => {
  console.error(err(`Unexpected error: ${e.message}`));
  process.exit(1);
});