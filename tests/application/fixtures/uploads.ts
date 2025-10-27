import type {
  InitiateUploadCommandEncoded,
  ConfirmUploadCommandEncoded
} from "@application/dto/document/commands.dto"
import type { DocumentId, UserId, WorkspaceId } from "@domain/refined/ids"
import type { FileKey, MimeType, FileSize } from "@domain/refined/file-reference"
import type { Sha256 } from "@domain/refined/checksum"

/**
 * Create an InitiateUpload request with deterministic contentRef
 */
export function makeInitiateUploadRequest(
  documentId: DocumentId,
  actorId: UserId,
  overrides: Partial<InitiateUploadCommandEncoded> & { workspaceId?: WorkspaceId } = {}
): InitiateUploadCommandEncoded {
  const contentRef = overrides.contentRef || `test-upload-${Date.now()}`
  
  return {
    documentId,
    actorId,
    workspaceId: overrides.workspaceId!,
    mimeType: "application/pdf" as MimeType,
    size: 1024 as FileSize,
    contentRef: contentRef as FileKey,
    checksum: undefined,
    ...overrides
  }
}

/**
 * Create a ConfirmUpload request with matching contentRef
 */
export function makeConfirmUploadRequest(
  documentId: DocumentId,
  actorId: UserId,
  fileKey: FileKey,
  contentRef: FileKey,
  overrides: Partial<ConfirmUploadCommandEncoded> & { workspaceId?: WorkspaceId } = {}
): ConfirmUploadCommandEncoded {
  // Default checksum based on contentRef for deterministic testing
  const defaultChecksum = `sha256:${contentRef}` as Sha256
  
  return {
    documentId,
    actorId,
    workspaceId: overrides.workspaceId!,
    fileKey,
    checksum: overrides.checksum || defaultChecksum,
    mimeType: "application/pdf" as MimeType,
    size: 1024 as FileSize,
    contentRef,
    versionHint: undefined,
    ...overrides
  }
}

/**
 * Create a matched pair of Initiate/Confirm requests for testing
 */
export function makeMatchedUploadRequests(
  documentId: DocumentId,
  actorId: UserId,
  workspaceId: WorkspaceId,
  contentRef?: FileKey
): {
  initiate: InitiateUploadCommandEncoded
  confirm: (fileKey: FileKey) => ConfirmUploadCommandEncoded
} {
  const ref = contentRef || (`test-upload-${Date.now()}` as FileKey)
  
  const initiate = makeInitiateUploadRequest(documentId, actorId, {
    workspaceId,
    contentRef: ref
  })
  
  const confirm = (fileKey: FileKey) => makeConfirmUploadRequest(
    documentId,
    actorId,
    fileKey,
    ref,
    { workspaceId }
  )
  
  return { initiate, confirm }
}

