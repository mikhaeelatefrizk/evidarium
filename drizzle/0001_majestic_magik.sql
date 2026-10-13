CREATE INDEX `audit_lookup_idx` ON `audit` (`project`,`created`);--> statement-breakpoint
CREATE INDEX `files_lookup_idx` ON `files` (`project`,`created`);--> statement-breakpoint
CREATE INDEX `messages_lookup_idx` ON `messages` (`project`,`created`);--> statement-breakpoint
CREATE INDEX `notes_lookup_idx` ON `notes` (`project`,`created`);--> statement-breakpoint
CREATE INDEX `projects_lookup_idx` ON `projects` (`owner`,`updated`);--> statement-breakpoint
CREATE INDEX `sources_lookup_idx` ON `sources` (`project`,`created`);--> statement-breakpoint
CREATE INDEX `tasks_lookup_idx` ON `tasks` (`project`,`created`);