import { Schema as S } from "effect"
import { DocumentVersion } from "../schema/document-version.schema"

export class DocumentVersionEntity {
  private constructor(readonly props: S.Schema.Type<typeof DocumentVersion>) {}

  static fromProps = (u: unknown) => {
    const props = S.decodeUnknownSync(DocumentVersion)(u)
    return new DocumentVersionEntity(props)
  }

  static unsafe = (p: S.Schema.Type<typeof DocumentVersion>) => new DocumentVersionEntity(p)
}
