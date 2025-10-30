ALTER TABLE "documents" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "tags" SET NOT NULL;