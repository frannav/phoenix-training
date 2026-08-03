CREATE TABLE `catalog_manifest` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`upstream_commit` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`review_revision` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`imported_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`source` text,
	`upstream_id` text,
	`source_revision` text,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`instructions` text NOT NULL,
	`recording_mode` text NOT NULL,
	`category` text NOT NULL,
	`body_part` text,
	`equipment` text,
	`available` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_source_upstream_unique` ON `exercise` (`source`,`upstream_id`) WHERE "exercise"."available" = 1;--> statement-breakpoint
CREATE INDEX `exercise_available_name_idx` ON `exercise` (`available`,`name`);