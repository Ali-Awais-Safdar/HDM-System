ALTER TABLE "documents" DROP CONSTRAINT "documents_current_version_id_document_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_version_check" CHECK (version >= 1);