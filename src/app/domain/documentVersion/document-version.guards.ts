import { Schema as S } from "effect"

export class DocumentVersionGuards {

  static readonly ValidFileSize = S.filter(
    (size: number) => size > 0 && size <= 100 * 1024 * 1024, // Max 100MB
    { message: () => "File size must be between 1 byte and 100MB" }
  )

  static readonly ValidMimeType = S.filter(
    (mimeType: string) => {
      const supportedTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
      ]
      return supportedTypes.includes(mimeType)
    },
    { message: () => "MIME type must be supported" }
  )
}
