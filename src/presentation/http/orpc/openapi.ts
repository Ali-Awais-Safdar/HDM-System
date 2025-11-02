import { router } from "./procedures"
import { OpenAPIGenerator } from "@orpc/openapi"
import type { OpenAPI } from "@orpc/contract"
import { env } from "@infra/config/env"
import { JSONSchema as EJSONSchema } from "effect"

/**
 * OpenAPI Specification Generator
 * 
 * Generates OpenAPI 3.0 specification from oRPC router procedures.
 * Includes:
 * - Top-level API info and servers
 * - Global security scheme (Bearer JWT)
 * - Global security requirements (overridden by procedures with security: [])
 * - Schema conversion from Standard Schema to OpenAPI schemas
 */

let cachedSpec: OpenAPI.Document | null = null


const effectSchemaConverter = {
  condition: async (schema: any) =>
    typeof schema === "function" &&
    schema?.ast !== undefined &&
    schema?.["~standard"]?.version === 1,

  convert: async (schema: any, _options: { strategy: "input" | "output" }): Promise<[boolean, any]> => {

    const annotateFiles = (s: any): any => {
      if (s && typeof s === "object" && s.type === "object" && s.properties?.file) {
        s.properties.file = { type: "string", contentMediaType: "application/octet-stream" }
      }
      return s
    }

    const json = annotateFiles(
      EJSONSchema.fromAST(schema.ast, {
        definitions: {},
        target: "openApi3.1"
      })
    )

    const required = true
    return [required, json] as [boolean, any]
  }
}

export async function buildOpenAPISpec(): Promise<OpenAPI.Document> {
  // Cache in production, regenerate in development
  if (env.IS_PRODUCTION && cachedSpec !== null) {
    return cachedSpec
  }

  const generator = new OpenAPIGenerator({
    schemaConverters: [effectSchemaConverter]
  })

  const spec = await generator.generate(router, {
    info: {
      title: "DMS Headless API",
      version: "1.0.0",
      description: "Document Management System API - A headless DMS with workspace support, access policies, and document versioning"
    },
    servers: [
      {
        url: "/rpc",
        description: "RPC endpoint"
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  })

  // Cache the spec in production
  if (env.IS_PRODUCTION) {
    cachedSpec = spec
  }

  return spec
}

