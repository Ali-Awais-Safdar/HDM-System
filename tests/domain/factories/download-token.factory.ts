import { Schema as S } from "effect"
import { faker } from "../factories/common"
import { DownloadToken as DownloadTokenSchema } from "@domain/downloadToken/download-token.schema"
import { DownloadTokenEntity } from "@domain/downloadToken/download-token.entity"
import { expectSuccess } from "../../utils/test.helpers"
import { DownloadTokenId, DocumentId, UserId } from "@domain/refined/ids"
import { DownloadTokenString } from "@domain/downloadToken/download-token.string.vo"
import { withTestClock } from "../setup/test-clock"

type EncodedDownloadToken = S.Schema.Encoded<typeof DownloadTokenSchema>

const makeExpiry = (now: Date): Date => {
  // Keep within default expiry window (<= 24h ahead)
  const minutes = faker.number.int({ min: 5, max: 60 * 12 }) // up to 12h
  return new Date(now.getTime() + minutes * 60 * 1000)
}

export const generateDownloadToken = (
  overrides: Partial<EncodedDownloadToken> = {},
  now: Date = new Date(Date.now())
): EncodedDownloadToken => {
  const base: EncodedDownloadToken = {
    id: faker.string.uuid() as DownloadTokenId,
    token: faker.string.alphanumeric({ length: { min: 32, max: 48 } }) as DownloadTokenString,
    documentId: faker.string.uuid() as DocumentId,
    issuedTo: faker.string.uuid() as UserId,
    expiresAt: makeExpiry(now).toISOString(),
    usedAt: undefined,
    createdAt: now.toISOString(),
    updatedAt: undefined,
  } as EncodedDownloadToken

  return { ...base, ...overrides } as EncodedDownloadToken
}

export const createDownloadTokenEntity = (
  overrides: Partial<EncodedDownloadToken> = {},
  now?: Date
) => {
  const effectiveNow = (() => {
    if (now) return now
    if (overrides.createdAt) return new Date(overrides.createdAt as string)
    if (overrides.expiresAt) {
      const exp = new Date(overrides.expiresAt as string)
      return new Date(exp.getTime() - 60 * 60 * 1000) // 1 hour before expiry
    }
    return new Date("2025-01-03T00:00:00.000Z")
  })()
  const data = generateDownloadToken(overrides, effectiveNow)
  return expectSuccess(withTestClock(DownloadTokenEntity.create(data), effectiveNow.getTime()))
}


