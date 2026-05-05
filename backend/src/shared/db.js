const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT || 5432);
    const database = process.env.DB_NAME;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const sslMode = (process.env.DB_SSL || "").toLowerCase();

    if (!host || !database || !user || !password) {
      throw new Error("DB_HOST, DB_NAME, DB_USER, DB_PASSWORD are required");
    }

    pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: sslMode === "require" ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000
    });
  }

  return pool;
}

async function query(text, params) {
  const p = getPool();
  return await p.query(text, params);
}

// Run a set of queries inside a transaction on a single checked-out client.
// The callback receives a `q(text, params)` helper that uses the same client.
async function withTransaction(fn) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const q = (text, params) => client.query(text, params);
    const result = await fn(q);
    // Handlers often return { err: failResponse } instead of throwing; those must roll back.
    if (result && Object.prototype.hasOwnProperty.call(result, "err") && result.err) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, withTransaction };

