export class DocumentValidationError extends Error {
  readonly _tag = "DocumentValidationError" as const
  constructor(message: string) { super(message) }
}

export class DocumentNotFoundError extends Error {
  readonly _tag = "DocumentNotFoundError" as const
  constructor(readonly id: string) { super(`Document ${id} not found`) }
}

export class DocumentPermissionError extends Error {
  readonly _tag = "DocumentPermissionError" as const
  constructor(message: string) { super(message) }
}

export class DocumentConflictError extends Error {
  readonly _tag = "DocumentConflictError" as const
  constructor(message: string) { super(message) }
}

// Union type for all document-related errors
export type DocumentError = 
  | DocumentValidationError 
  | DocumentNotFoundError 
  | DocumentPermissionError 
  | DocumentConflictError
