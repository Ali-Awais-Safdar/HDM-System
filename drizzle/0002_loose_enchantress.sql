ALTER TABLE "access_policies" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "access_policies" ALTER COLUMN "resource_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "access_policies" ALTER COLUMN "subject_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "document_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ALTER COLUMN "created_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "owner_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "current_version_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "document_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "download_tokens" ALTER COLUMN "issued_to" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "workspace_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_document_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;