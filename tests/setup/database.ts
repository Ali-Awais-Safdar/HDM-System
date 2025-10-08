import { drizzle } from "drizzle-orm/node-postgres";
import * as pg from "pg";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@infra/services/db/schema";
import type { DatabaseInterface } from "@infra/services/db/interfaces";
import { sql } from "drizzle-orm";

/**
 * Test database wrapper with cleanup capabilities
 */
export interface TestDatabase {
  readonly db: DatabaseInterface;
  readonly container: StartedPostgreSqlContainer;
  readonly cleanup: () => Promise<void>;
}

export async function setupTestDatabase(): Promise<TestDatabase> {
  // Start PostgreSQL container
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withExposedPorts(5432)
    .withStartupTimeout(120_000)
    .start();

  const connectionString = container.getConnectionUri();

  // Create connection pool
  const pool = new pg.Pool({
    connectionString,
    max: 10,
  });

  // Create Drizzle instance
  const db = drizzle(pool, { schema }) as DatabaseInterface;

  // Run migrations
  await migrate(db, { migrationsFolder: "./drizzle" });

  // Cleanup function
  const cleanup = async () => {
    await pool.end();
    await container.stop();
  };

  return { db, container, cleanup };
}

export async function cleanupDatabase(db: DatabaseInterface): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE download_tokens CASCADE`);
  await db.execute(sql`TRUNCATE TABLE access_policies CASCADE`);
  await db.execute(sql`TRUNCATE TABLE document_versions CASCADE`);
  await db.execute(sql`TRUNCATE TABLE documents CASCADE`);
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
}

export async function createTestUser(
  db: DatabaseInterface,
  overrides: {
    id?: string;
    email?: string;
    passwordHash?: string;
    roles?: string[];
    workspaceId?: string | null;
  } = {}
): Promise<{ id: string; email: string; passwordHash: string; roles: string[]; workspaceId: string | null; createdAt: Date }> {
  const userId = overrides.id ?? crypto.randomUUID();
  const email = overrides.email ?? `test-${userId.slice(0, 8)}@example.com`;
  const passwordHash = overrides.passwordHash ?? "$2b$10$dummyHashForTesting1234567890123456789012";
  const roles = overrides.roles ?? ["USER"];
  const workspaceId = overrides.workspaceId ?? null;

  const [user] = await db
    .insert(schema.users)
    .values({
      id: userId,
      email,
      passwordHash,
      roles,
      workspaceId,
      createdAt: new Date(),
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create test user");
  }

  return user;
}

export async function createTestDocument(
  db: DatabaseInterface,
  ownerId: string,
  overrides: {
    id?: string;
    title?: string;
    description?: string | null;
    tags?: string[] | null;
    currentVersionId?: string;
  } = {}
): Promise<{ id: string; ownerId: string; title: string; currentVersionId: string; createdAt: Date; updatedAt: Date | null }> {
  const documentId = overrides.id ?? crypto.randomUUID();
  const currentVersionId = overrides.currentVersionId ?? crypto.randomUUID();
  const title = overrides.title ?? `Test Document ${documentId.slice(0, 8)}`;

  const [document] = await db
    .insert(schema.documents)
    .values({
      id: documentId,
      ownerId,
      title,
      description: overrides.description ?? null,
      tags: overrides.tags ?? null,
      currentVersionId,
      createdAt: new Date(),
    })
    .returning();

  if (!document) {
    throw new Error("Failed to create test document");
  }

  return document;
}

export async function seedTestData(db: DatabaseInterface): Promise<{
  users: Array<{ id: string; email: string }>;
  documents: Array<{ id: string; ownerId: string; title: string }>;
}> {
  // Create deterministic test users
  const user1 = await createTestUser(db, {
    id: "10000000-0000-0000-0000-000000000001",
    email: "alice@example.com",
    roles: ["USER"],
  });

  const user2 = await createTestUser(db, {
    id: "10000000-0000-0000-0000-000000000002",
    email: "bob@example.com",
    roles: ["USER"],
  });

  const admin = await createTestUser(db, {
    id: "10000000-0000-0000-0000-000000000003",
    email: "admin@example.com",
    roles: ["ADMIN"],
  });

  // Create deterministic test documents
  const doc1 = await createTestDocument(db, user1.id, {
    id: "20000000-0000-0000-0000-000000000001",
    title: "Quarterly Report Q1 2024",
    description: "Financial results for Q1",
    tags: ["finance", "report", "q1"],
  });

  const doc2 = await createTestDocument(db, user1.id, {
    id: "20000000-0000-0000-0000-000000000002",
    title: "Employee Handbook",
    description: null,
    tags: ["hr", "policy"],
  });

  const doc3 = await createTestDocument(db, user2.id, {
    id: "20000000-0000-0000-0000-000000000003",
    title: "Technical Specifications",
    tags: ["engineering", "specs"],
  });

  return {
    users: [
      { id: user1.id, email: user1.email },
      { id: user2.id, email: user2.email },
      { id: admin.id, email: admin.email },
    ],
    documents: [
      { id: doc1.id, ownerId: doc1.ownerId, title: doc1.title },
      { id: doc2.id, ownerId: doc2.ownerId, title: doc2.title },
      { id: doc3.id, ownerId: doc3.ownerId, title: doc3.title },
    ],
  };
}

