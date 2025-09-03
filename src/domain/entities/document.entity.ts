import { DocumentId, UserId, MimeType, FileSize } from "../../shared/types/brand";

export interface DocumentEntity {
  readonly id: DocumentId;
  readonly ownerId: UserId;
  readonly title: string;
  readonly mimeType: MimeType;
  readonly size: FileSize;
  readonly storageKey: string;
  readonly metadata: Record<string, unknown>;
  readonly tags: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date | null;
}

export class Document implements DocumentEntity {
  constructor(
    public readonly id: DocumentId,
    public readonly ownerId: UserId,
    public readonly title: string,
    public readonly mimeType: MimeType,
    public readonly size: FileSize,
    public readonly storageKey: string,
    public readonly metadata: Record<string, unknown> = {},
    public readonly tags: string[] = [],
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date | null = null
  ) {
    this.validateTitle(title);
    this.validateSize(size);
  }

  private validateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new Error("Document title cannot be empty");
    }
    if (title.length > 255) {
      throw new Error("Document title cannot exceed 255 characters");
    }
  }

  private validateSize(size: FileSize): void {
    if (size <= 0) {
      throw new Error("Document size must be positive");
    }
  }

  updateMetadata(metadata: Record<string, unknown>): Document {
    return new Document(
      this.id,
      this.ownerId,
      this.title,
      this.mimeType,
      this.size,
      this.storageKey,
      { ...this.metadata, ...metadata },
      this.tags,
      this.createdAt,
      new Date()
    );
  }

  addTags(newTags: string[]): Document {
    const uniqueTags = Array.from(new Set([...this.tags, ...newTags]));
    return new Document(
      this.id,
      this.ownerId,
      this.title,
      this.mimeType,
      this.size,
      this.storageKey,
      this.metadata,
      uniqueTags,
      this.createdAt,
      new Date()
    );
  }

  removeTags(tagsToRemove: string[]): Document {
    const filteredTags = this.tags.filter(tag => !tagsToRemove.includes(tag));
    return new Document(
      this.id,
      this.ownerId,
      this.title,
      this.mimeType,
      this.size,
      this.storageKey,
      this.metadata,
      filteredTags,
      this.createdAt,
      new Date()
    );
  }

  static create(props: {
    id: DocumentId;
    ownerId: UserId;
    title: string;
    mimeType: MimeType;
    size: FileSize;
    storageKey: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Document {
    return new Document(
      props.id,
      props.ownerId,
      props.title,
      props.mimeType,
      props.size,
      props.storageKey,
      props.metadata,
      props.tags
    );
  }
}
