export * from './document'
export * from './documentVersion'
export * from './accessPolicy'
export * from './downloadToken'

// Command DTOs
export { DocumentCommandDTO } from './document/commands.dto'
export { DocumentQueryDTO } from './document/queries.dto'
export { DocumentVersionQueryDTO } from './documentVersion/commands.dto'
export { AccessPolicyCommandDTO } from './accessPolicy/commands.dto'
export { DownloadTokenDTO } from './downloadToken/commands.dto'

// Response DTOs
export { DocumentResponseDTO } from './document/responses.dto'
export { DocumentVersionDTO as DocumentVersionResponseDTO } from './documentVersion/responses.dto'
export { AccessPolicyDTO } from './accessPolicy/responses.dto'
export { DownloadTokenResponseDTO } from './downloadToken/responses.dto'
