import { Schema as S } from "effect"
import { AuditTrail } from "@domain/utils/audit-trail"

// BaseEntitySchema factory: composes id and AuditTrail (createdAt, updatedAt: Option<Date>) into any entity struct
export const BaseEntitySchema = <IdSchema extends S.Schema<any, any, any>>(idSchema: IdSchema) =>
  S.extend(
    S.Struct({ id: idSchema }),
    AuditTrail
  )
