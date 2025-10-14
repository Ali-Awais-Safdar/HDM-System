import { Schema as S } from "effect"

export const VersionNumber = S.Number.pipe(
  S.int(),
  S.filter((n: number) => n > 0, { message: () => "Version must be a positive integer" }),
  S.brand("VersionNumber")
)
export type VersionNumber = S.Schema.Type<typeof VersionNumber>

export const compareVersions = (a: number, b: number): number => (a === b ? 0 : a > b ? 1 : -1)
export const isNewerThan = (a: number, b: number): boolean => compareVersions(a, b) > 0
export const isOlderThan = (a: number, b: number): boolean => compareVersions(a, b) < 0
export const isFirstVersion = (v: number): boolean => v === 1


