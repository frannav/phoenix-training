CREATE TABLE `training_session_series` (
	`id` text PRIMARY KEY NOT NULL,
	`session_exercise_id` text NOT NULL,
	`status` text NOT NULL,
	`position` integer NOT NULL,
	`added` integer DEFAULT false NOT NULL,
	`goal_carga` real,
	`goal_repeticiones` integer,
	`goal_duracion` integer,
	`carga` real,
	`repeticiones` integer,
	`duracion` integer,
	`rpe` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_exercise_id`) REFERENCES `training_session_exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `training_session_series_exercise_position_idx` ON `training_session_series` (`session_exercise_id`,`position`);