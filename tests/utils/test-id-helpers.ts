import { Effect as E, Schema as S } from "effect";
import { UserId, DocumentId, DocumentVersionId, DownloadTokenId, UuidString } from "../../src/app/domain/value-objects/id.vo";

/**
 * Helper functions to create branded ID types for tests.
 */

export const createUserId = (uuid?: string): UserId => {
  const id = uuid ?? crypto.randomUUID();
  return E.runSync(S.decodeUnknown(UserId)(id));
};

export const createDocumentId = (uuid?: string): DocumentId => {
  const id = uuid ?? crypto.randomUUID();
  return E.runSync(S.decodeUnknown(DocumentId)(id));
};

export const createDocumentVersionId = (uuid?: string): DocumentVersionId => {
  const id = uuid ?? crypto.randomUUID();
  return E.runSync(S.decodeUnknown(DocumentVersionId)(id));
};

export const createDownloadTokenId = (uuid?: string): DownloadTokenId => {
  const id = uuid ?? crypto.randomUUID();
  return E.runSync(S.decodeUnknown(DownloadTokenId)(id));
};

export const createUuidString = (uuid?: string): UuidString => {
  const id = uuid ?? crypto.randomUUID();
  return E.runSync(S.decodeUnknown(UuidString)(id));
};
