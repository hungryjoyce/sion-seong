// Neon Postgres client shared by both serverless functions.
// Uses the HTTP driver so there's no connection pooling to manage
// across cold starts.

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL is not set — DB calls will fail until it is.");
}

export const sql = neon(url || "");

// Ensures the `letters` table exists. Memoised per warm instance so
// we don't hammer Postgres with CREATE TABLE IF NOT EXISTS.
let schemaPromise = null;
export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = sql`
      CREATE TABLE IF NOT EXISTS letters (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        deliver_on DATE NOT NULL,
        letter TEXT NOT NULL,
        stamp_label TEXT NOT NULL,
        written_on DATE NOT NULL,
        sent_at TIMESTAMPTZ,
        attempts INT NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.then(() =>
      sql`CREATE INDEX IF NOT EXISTS letters_due_idx ON letters (deliver_on) WHERE sent_at IS NULL`
    ).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}
