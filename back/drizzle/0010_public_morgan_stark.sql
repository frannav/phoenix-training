ALTER TABLE `training_session` ADD `planned_date` text;--> statement-breakpoint
ALTER TABLE `training_session` ADD `routine_id` text REFERENCES routine(id);--> statement-breakpoint
ALTER TABLE `training_session` ADD `plan_training_id` text REFERENCES plan_training(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `training_session_one_finalized_per_training_idx` ON `training_session` (`plan_training_id`) WHERE "training_session"."status" = 'finalizada';--> statement-breakpoint
ALTER TABLE `training_session_exercise` ADD `added` integer DEFAULT false NOT NULL;