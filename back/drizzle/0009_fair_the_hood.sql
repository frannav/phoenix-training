ALTER TABLE `plan` ADD `start_date` text;--> statement-breakpoint
CREATE UNIQUE INDEX `plan_single_active_idx` ON `plan` (`account_id`) WHERE "plan"."status" = 'activo';--> statement-breakpoint
ALTER TABLE `plan_training` ADD `planned_date` text;--> statement-breakpoint
ALTER TABLE `plan_training` ADD `status` text;