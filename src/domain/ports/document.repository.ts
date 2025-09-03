import { Document } from "../entities/document.entity";
import { DocumentId, UserId } from "../../shared/types/brand";
import { Result } from "../../shared/result/result";

export interface DocumentSearchFilters {
  query?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  ownerId?: UserId;
  limit?: number;
  offset?: number;
}

export interface DocumentRepository {
  findById(id: DocumentId): Promise<Result<Document | null, Error>>;
  findByOwner(ownerId: UserId): Promise<Result<Document[], Error>>;
  search(filters: DocumentSearchFilters): Promise<Result<Document[], Error>>;
  save(document: Document): Promise<Result<Document, Error>>;
  delete(id: DocumentId): Promise<Result<void, Error>>;
}
