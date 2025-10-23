import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as schema from "@infra/db/schema"
import type { DatabaseInterface } from "@infra/db/interfaces"

export interface TestDatabase {
  db: DatabaseInterface
  cleanup: () => Promise<void>
}

// Global container for shared usage across tests
let globalContainer: StartedPostgreSqlContainer | null = null
let globalPool: pg.Pool | null = null

/**
 * Setup a shared PostgreSQL container for the entire test file.
 * This should be called once per test file, not per test.
 */
export async function setupSharedTestDatabase(): Promise<TestDatabase> {
  // Only create container if it doesn't exist
  if (!globalContainer) {
    globalContainer = await new PostgreSqlContainer("postgres:15")
      .withDatabase("test_db")
      .withUsername("test")
      .withPassword("test")
      .withExposedPorts(5432)
      .start()

    const connectionString = globalContainer.getConnectionUri()
    
    // Create a shared connection pool
    globalPool = new pg.Pool({
      connectionString,
      max: 10, // Increased for shared usage
      idleTimeoutMillis: 30000,
    })
  }

  // Create the database interface using the shared pool
  const db: DatabaseInterface = drizzle(globalPool!, { schema })

  // Run migrations to set up the schema (only once)
  await migrate(db, { migrationsFolder: "./drizzle" })

  return {
    db,
    cleanup: async () => {
      // Don't cleanup the shared container here
      // It will be cleaned up by cleanupSharedTestDatabase()
    }
  }
}

/**
 * Clean up the shared PostgreSQL container.
 * This should be called once per test file, typically in afterAll.
 */
export async function cleanupSharedTestDatabase(): Promise<void> {
  if (globalPool) {
    await globalPool.end()
    globalPool = null
  }
  
  if (globalContainer) {
    await globalContainer.stop()
    globalContainer = null
  }
}

/**
 * Clear all data from the database while keeping the schema.
 * This provides a clean state for each test without recreating the container.
 */
export async function clearTestDatabase(db: DatabaseInterface): Promise<void> {
  const { sql } = await import("drizzle-orm")
  
  // Clear all tables in the correct order (respecting foreign key constraints)
  await db.execute(sql`TRUNCATE TABLE access_policies CASCADE`)
  await db.execute(sql`TRUNCATE TABLE download_tokens CASCADE`)
  await db.execute(sql`TRUNCATE TABLE document_versions CASCADE`)
  await db.execute(sql`TRUNCATE TABLE documents CASCADE`)
  await db.execute(sql`TRUNCATE TABLE users CASCADE`)
}

// Legacy functions for backward compatibility (deprecated)
export async function setupTestDatabase(): Promise<TestDatabase> {
  console.warn("setupTestDatabase() is deprecated. Use setupSharedTestDatabase() for better performance.")
  return setupSharedTestDatabase()
}

export async function cleanupTestDatabase(): Promise<void> {
  console.warn("cleanupTestDatabase() is deprecated. Use cleanupSharedTestDatabase() for better performance.")
  return cleanupSharedTestDatabase()
}
