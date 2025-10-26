ALTER TABLE "documents" ADD COLUMN "publish_status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "publish_notes" text;--> statement-breakpoint
CREATE INDEX "documents_publish_status_idx" ON "documents" USING btree ("publish_status");