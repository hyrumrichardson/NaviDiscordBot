import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });
export const db = drizzle(pool, { schema });

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
