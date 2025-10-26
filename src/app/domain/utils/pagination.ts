import { Schema as S } from "effect"

/**
 * Pagination types for repository contracts.
 */

export interface PaginationOptions {
  readonly pageNum: number  // 1-based page number
  readonly pageSize: number // Number of items per page
}

export interface Paginated<T> {
  readonly data: readonly T[]
  readonly total: number
  readonly pageNum: number
  readonly pageSize: number
  readonly totalPages: number
}

export const PageNumber = S.Number.pipe(
  S.int(),
  S.filter((value) => value >= 1, {
    message: () => "Page number must be 1 or greater"
  }),
  S.brand("PageNumber")
)
export type PageNumber = S.Schema.Type<typeof PageNumber>

export const DocumentPageSize = S.Number.pipe(
  S.int(),
  S.filter((value) => value >= 1 && value <= 100, {
    message: () => "Page size must be between 1 and 100"
  }),
  S.brand("DocumentPageSize")
)
export type DocumentPageSize = S.Schema.Type<typeof DocumentPageSize>

export const VersionPageSize = S.Number.pipe(
  S.int(),
  S.filter((value) => value >= 1 && value <= 50, {
    message: () => "Page size must be between 1 and 50"
  }),
  S.brand("VersionPageSize")
)
export type VersionPageSize = S.Schema.Type<typeof VersionPageSize>

export const defaultPaginationOptions = (): PaginationOptions => ({
  pageNum: 1,
  pageSize: 10
})

export const calculateTotalPages = (total: number, pageSize: number): number =>
  Math.ceil(total / pageSize)

