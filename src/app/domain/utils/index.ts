/**
 * Domain Utils - Core utilities for the domain layer
 * 
 * This module exports all utilities needed for domain entities,
 * validation, errors, and type safety.
 */

// Base utilities
export * from "./base.entity"
export * from "./base.repository"
export * from "./base.errors"
export * from "./validation.utils"
export * from "./refined.types"
export * from "./pagination"
export * from "./option.utils"
export { Optional as SchemaOptional } from "./schema.utils"
