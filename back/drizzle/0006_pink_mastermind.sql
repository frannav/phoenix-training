CREATE TABLE `training_session` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`origin` text NOT NULL,
	`status` text DEFAULT 'activa' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`date_performed` text NOT NULL,
	`last_exercise_id` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_session_single_active_idx` ON `training_session` (`account_id`) WHERE "training_session"."status" = 'activa';--> statement-breakpoint
CREATE TABLE `training_session_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `training_session_exercise_session_order_idx` ON `training_session_exercise` (`session_id`,`sort_order`);