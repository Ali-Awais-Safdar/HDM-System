CREATE TABLE "access_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" text NOT NULL,
	"subject_type" varchar(50) NOT NULL,
	"subject_id" text,
	"role" varchar(50),
	"actions" jsonb NOT NULL,
	"effect" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"document_id" text NOT NULL,
	"version" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"file_key" varchar(512) NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size" integer NOT NULL,
	"created_by" text,
	CONSTRAINT "document_versions_doc_ver_unique" UNIQUE("document_id","version")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"owner_id" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"tags" jsonb,
	"current_version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"token" varchar(255) NOT NULL,
	"document_id" text NOT NULL,
	"issued_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "download_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"roles" jsonb NOT NULL,
	"workspace_id" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_resource_id_documents_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_issued_to_users_id_fk" FOREIGN KEY ("issued_to") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_policies_resource_idx" ON "access_policies" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "access_policies_subject_idx" ON "access_policies" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "access_policies_role_idx" ON "access_policies" USING btree ("role");--> statement-breakpoint
CREATE INDEX "access_policies_created_at_idx" ON "access_policies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "document_versions_document_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_created_at_idx" ON "document_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_title_idx" ON "documents" USING btree ("title");--> statement-breakpoint
CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_current_version_idx" ON "documents" USING btree ("current_version_id");--> statement-breakpoint
CREATE INDEX "download_tokens_document_idx" ON "download_tokens" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "download_tokens_issued_to_idx" ON "download_tokens" USING btree ("issued_to");--> statement-breakpoint
CREATE INDEX "download_tokens_expires_at_idx" ON "download_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "download_tokens_token_idx" ON "download_tokens" USING btree ("token");