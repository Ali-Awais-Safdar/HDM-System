-- Drop foreign key constraints before changing column types
ALTER TABLE "access_policies" DROP CONSTRAINT IF EXISTS "access_policies_resource_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "access_policies" DROP CONSTRAINT IF EXISTS "access_policies_subject_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "document_versions" DROP CONSTRAINT IF EXISTS "document_versions_document_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "document_versions" DROP CONSTRAINT IF EXISTS "document_versions_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_owner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "download_tokens" DROP CONSTRAINT IF EXISTS "download_tokens_document_id_documents_id_fk";--> statement-breakpoint
ALTER TABLE "download_tokens" DROP CONSTRAINT IF EXISTS "download_tokens_issued_to_users_id_fk";--> statement-breakpoint

-- Change column types to UUID
ALTER TABLE "access_policies" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "access_policies" ALTER COLUMN "resource_id" SET DATA TYPE uuid USING "resource_id"::uuid;--> statement-breakpoint
ALTER TABLE "access_policies" ALTER COLUMN "subject_id" SET DATA TYPE uuid USING "subject_id"::uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "document_id" SET DATA TYPE uuid USING "document_id"::uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "owner_id" SET DATA TYPE uuid USING "owner_id"::uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "current_version_id" SET DATA TYPE uuid USING "current_version_id"::uuid;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "document_id" SET DATA TYPE uuid USING "document_id"::uuid;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "issued_to" SET DATA TYPE uuid USING "issued_to"::uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "workspace_id" SET DATA TYPE uuid USING "workspace_id"::uuid;

-- Recreate foreign key constraints
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_resource_id_documents_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_issued_to_users_id_fk" FOREIGN KEY ("issued_to") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_document_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;