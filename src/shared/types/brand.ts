/**
 * Branded types to prevent mixing different ID types at compile time.
 * This follows the company's best practices for type safety.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

// Domain ID types
export type UserId = Brand<string, "UserId">;
export type DocumentId = Brand<string, "DocumentId">;
export type TagId = Brand<string, "TagId">;
export type PermissionId = Brand<string, "PermissionId">;
export type DownloadTokenId = Brand<string, "DownloadTokenId">;

// Value object types
export type MimeType = Brand<string, "MimeType">;
export type EmailAddress = Brand<string, "EmailAddress">;
export type FileSize = Brand<number, "FileSize">;

// Helper functions to create branded types
export const asUserId = (s: string): UserId => s as UserId;
export const asDocumentId = (s: string): DocumentId => s as DocumentId;
export const asTagId = (s: string): TagId => s as TagId;
export const asPermissionId = (s: string): PermissionId => s as PermissionId;
export const asDownloadTokenId = (s: string): DownloadTokenId => s as DownloadTokenId;

export const asMimeType = (s: string): MimeType => s as MimeType;
export const asEmailAddress = (s: string): EmailAddress => s as EmailAddress;
export const asFileSize = (n: number): FileSize => n as FileSize;

// UUID generator with branded types
import { newId } from "../uuid";

export const newUserId = (): UserId => asUserId(newId());
export const newDocumentId = (): DocumentId => asDocumentId(newId());
export const newTagId = (): TagId => asTagId(newId());
export const newPermissionId = (): PermissionId => asPermissionId(newId());
export const newDownloadTokenId = (): DownloadTokenId => asDownloadTokenId(newId());
