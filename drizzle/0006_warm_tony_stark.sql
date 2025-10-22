DROP INDEX IF EXISTS "download_tokens_token_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "access_policies_resource_subject_unique";--> statement-breakpoint
ALTER TABLE "access_policies" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "access_policies" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "access_policies_resource_subject_unique" ON "access_policies" USING btree ("resource_id","subject_type",coalesce("subject_id"::text, ''),coalesce("role", ''));