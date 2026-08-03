CREATE TABLE `recorded_max` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`load` real NOT NULL,
	`repetitions` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recorded_max_account_exercise_reps_date_idx` ON `recorded_max` (`account_id`,`exercise_id`,`repetitions`,`date`);