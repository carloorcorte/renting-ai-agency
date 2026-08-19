// Applies db/schema.sql to DATABASE_URL. One flat file is enough at this
// scale — reach for a migration framework once schema changes need to be
// sequenced/rolled back across environments instead of applied fresh.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const sql = readFileSync(join(import.meta.dirname, "..", "db", "schema.sql"), "utf8");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(sql);
    console.log("Schema applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
