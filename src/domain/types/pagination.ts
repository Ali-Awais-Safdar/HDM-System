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

export const defaultPaginationOptions = (): PaginationOptions => ({
  pageNum: 1,
  pageSize: 10
})

export const calculateTotalPages = (total: number, pageSize: number): number =>
  Math.ceil(total / pageSize)

