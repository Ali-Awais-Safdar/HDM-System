import { Schema as S, Option } from "effect"
import { Document } from "../schema/document.schema"

export class DocumentEntity {
  private constructor(readonly props: S.Schema.Type<typeof Document>) {}

  static fromProps = (u: unknown) => {
    const props = S.decodeUnknownSync(Document)(u)
    return new DocumentEntity(props)
  }

  static unsafe = (p: S.Schema.Type<typeof Document>) => new DocumentEntity(p)

  // convenience read accessors
  get id() { return this.props.id }
  get ownerId() { return this.props.ownerId }
  get title() { return this.props.title }
  get description() { return this.props.description }
  get tags() { return this.props.tags }
  get currentVersionId() { return this.props.currentVersionId }
  get createdAt() { return this.props.createdAt }
  get updatedAt() { return this.props.updatedAt }

  // example rich behavior: pure update => new instance
  rename = (newTitle: string) =>
    DocumentEntity.fromProps({ ...this.props, title: newTitle, updatedAt: Option.some(new Date()) })

  updateDescription = (newDescription: string | undefined) =>
    DocumentEntity.fromProps({ ...this.props, description: newDescription, updatedAt: Option.some(new Date()) })

  addTags = (newTags: string[]) => {
    const currentTags = this.props.tags || []
    const normalizedNewTags = newTags.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0)
    const allTags = [...currentTags, ...normalizedNewTags]
    const uniqueTags = Array.from(new Set(allTags))
    return DocumentEntity.fromProps({ ...this.props, tags: uniqueTags, updatedAt: Option.some(new Date()) })
  }

  removeTags = (tagsToRemove: string[]) => {
    const currentTags = this.props.tags || []
    const normalizedTagsToRemove = tagsToRemove.map(tag => tag.trim().toLowerCase())
    const filteredTags = currentTags.filter(tag => !normalizedTagsToRemove.includes(tag.toLowerCase()))
    return DocumentEntity.fromProps({ ...this.props, tags: filteredTags, updatedAt: Option.some(new Date()) })
  }
}
