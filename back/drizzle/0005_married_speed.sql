CREATE TABLE `routine` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_account_idx` ON `routine` (`account_id`);--> statement-breakpoint
CREATE TABLE `routine_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `routine_exercise_routine_idx` ON `routine_exercise` (`routine_id`);--> statement-breakpoint
CREATE TABLE `routine_series_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`carga` real,
	`repeticiones` integer,
	`duracion` integer,
	FOREIGN KEY (`routine_exercise_id`) REFERENCES `routine_exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_series_goal_exercise_idx` ON `routine_series_goal` (`routine_exercise_id`);