CREATE TABLE `plan` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'borrador' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_account_idx` ON `plan` (`account_id`);--> statement-breakpoint
CREATE TABLE `plan_training` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`week_id` text NOT NULL,
	`day` integer NOT NULL,
	`source` text NOT NULL,
	`routine_id` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_id`) REFERENCES `plan_week`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_training_plan_idx` ON `plan_training` (`plan_id`);--> statement-breakpoint
CREATE INDEX `plan_training_week_idx` ON `plan_training` (`week_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_training_week_day_unique` ON `plan_training` (`week_id`,`day`);--> statement-breakpoint
CREATE TABLE `plan_training_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_training_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`plan_training_id`) REFERENCES `plan_training`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_training_exercise_training_idx` ON `plan_training_exercise` (`plan_training_id`);--> statement-breakpoint
CREATE TABLE `plan_training_series_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_training_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`carga` real,
	`repeticiones` integer,
	`duracion` integer,
	FOREIGN KEY (`plan_training_exercise_id`) REFERENCES `plan_training_exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_training_series_goal_exercise_idx` ON `plan_training_series_goal` (`plan_training_exercise_id`);--> statement-breakpoint
CREATE TABLE `plan_week` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_week_plan_idx` ON `plan_week` (`plan_id`);