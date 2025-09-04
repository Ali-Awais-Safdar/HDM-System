import { eq, lt } from "drizzle-orm";
import { 
  DownloadTokenRepository, 
  DownloadTokenRepositoryError 
} from "../../../domain/services/download-token.service";
import { DownloadToken } from "../../../domain/entities/download-token.entity";
import { Result, ok, err } from "../../../shared/result/result";
import { UserId, DocumentId, asDownloadTokenId } from "../../../shared/types/brand";
import { downloadTokens } from "../../../lib/db/schema";
import { Database } from "../../../lib/db/connection";

/**
 * Drizzle ORM implementation of the DownloadTokenRepository.
 * Handles all database operations for download tokens.
 */
export class DrizzleDownloadTokenRepository implements DownloadTokenRepository {
  constructor(private readonly db: Database) {}

  async save(token: DownloadToken): Promise<Result<DownloadToken, DownloadTokenRepositoryError>> {
    try {
      const tokenData = {
        token: token.token,
        documentId: token.documentId,
        issuedTo: token.issuedTo,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        createdAt: token.createdAt,
      };

      await this.db.insert(downloadTokens).values(tokenData);

      return ok(token);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return err(new DownloadTokenRepositoryError(
          "Download token already exists",
          "TOKEN_ALREADY_EXISTS",
          error
        ));
      }

      return err(new DownloadTokenRepositoryError(
        "Failed to save download token",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async findByToken(tokenString: string): Promise<Result<DownloadToken | null, DownloadTokenRepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(downloadTokens)
        .where(eq(downloadTokens.token, tokenString))
        .limit(1);

      if (result.length === 0) {
        return ok(null);
      }

      const tokenRow = result[0]!;
      const token = DownloadToken.fromPersistence({
        id: asDownloadTokenId(tokenRow.token), // Using token as ID for this case
        token: tokenRow.token,
        documentId: tokenRow.documentId as DocumentId,
        issuedTo: tokenRow.issuedTo as UserId,
        expiresAt: tokenRow.expiresAt,
        usedAt: tokenRow.usedAt,
        createdAt: tokenRow.createdAt,
      });

      return ok(token);
    } catch (error) {
      return err(new DownloadTokenRepositoryError(
        "Failed to find download token",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async findByDocument(documentId: DocumentId): Promise<Result<DownloadToken[], DownloadTokenRepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(downloadTokens)
        .where(eq(downloadTokens.documentId, documentId));

      const tokens = result.map(row => 
        DownloadToken.fromPersistence({
          id: asDownloadTokenId(row.token),
          token: row.token,
          documentId: row.documentId as DocumentId,
          issuedTo: row.issuedTo as UserId,
          expiresAt: row.expiresAt,
          usedAt: row.usedAt,
          createdAt: row.createdAt,
        })
      );

      return ok(tokens);
    } catch (error) {
      return err(new DownloadTokenRepositoryError(
        "Failed to find download tokens by document",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async findByUser(userId: UserId): Promise<Result<DownloadToken[], DownloadTokenRepositoryError>> {
    try {
      const result = await this.db
        .select()
        .from(downloadTokens)
        .where(eq(downloadTokens.issuedTo, userId));

      const tokens = result.map(row => 
        DownloadToken.fromPersistence({
          id: asDownloadTokenId(row.token),
          token: row.token,
          documentId: row.documentId as DocumentId,
          issuedTo: row.issuedTo as UserId,
          expiresAt: row.expiresAt,
          usedAt: row.usedAt,
          createdAt: row.createdAt,
        })
      );

      return ok(tokens);
    } catch (error) {
      return err(new DownloadTokenRepositoryError(
        "Failed to find download tokens by user",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async update(token: DownloadToken): Promise<Result<DownloadToken, DownloadTokenRepositoryError>> {
    try {
      const result = await this.db
        .update(downloadTokens)
        .set({ 
          usedAt: token.usedAt,
        })
        .where(eq(downloadTokens.token, token.token))
        .returning();

      if (result.length === 0) {
        return err(new DownloadTokenRepositoryError(
          "Download token not found for update",
          "TOKEN_NOT_FOUND"
        ));
      }

      const updatedRow = result[0]!;
      const updatedToken = DownloadToken.fromPersistence({
        id: asDownloadTokenId(updatedRow.token),
        token: updatedRow.token,
        documentId: updatedRow.documentId as DocumentId,
        issuedTo: updatedRow.issuedTo as UserId,
        expiresAt: updatedRow.expiresAt,
        usedAt: updatedRow.usedAt,
        createdAt: updatedRow.createdAt,
      });

      return ok(updatedToken);
    } catch (error) {
      return err(new DownloadTokenRepositoryError(
        "Failed to update download token",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async removeExpiredTokens(): Promise<Result<number, DownloadTokenRepositoryError>> {
    try {
      const now = new Date();
      const result = await this.db
        .delete(downloadTokens)
        .where(lt(downloadTokens.expiresAt, now));

      const deletedCount = result.rowCount || 0;
      return ok(deletedCount);
    } catch (error) {
      return err(new DownloadTokenRepositoryError(
        "Failed to remove expired download tokens",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }

  async removeByDocument(documentId: DocumentId): Promise<Result<number, DownloadTokenRepositoryError>> {
    try {
      const result = await this.db
        .delete(downloadTokens)
        .where(eq(downloadTokens.documentId, documentId));

      const deletedCount = result.rowCount || 0;
      return ok(deletedCount);
    } catch (error) {
      return err(new DownloadTokenRepositoryError(
        "Failed to remove download tokens by document",
        "DATABASE_ERROR",
        error instanceof Error ? error : new Error(String(error))
      ));
    }
  }
}
