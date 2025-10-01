import { DocumentEntity } from "../entities/document.entity";
import { DocumentId, UserId } from "../value-objects/id.vo";

export interface DocumentSearchFilters {
  query?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  ownerId?: UserId;
  limit?: number;
  offset?: number;
}

export interface DocumentRepository {
  findById(id: DocumentId): Promise<DocumentEntity | null>;
  findByOwner(ownerId: UserId): Promise<readonly DocumentEntity[]>;
  search(filters: DocumentSearchFilters): Promise<readonly DocumentEntity[]>;
  save(document: DocumentEntity): Promise<DocumentEntity>;
  delete(id: DocumentId): Promise<void>;
}
