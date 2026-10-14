CREATE TABLE `search_indexes` (
	`project` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`indexed` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `files` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `files` ADD `provenance` text;--> statement-breakpoint
CREATE UNIQUE INDEX `files_source_idx` ON `files` (`project`,`source_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD `citation_audit` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `pmcid` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `access` text DEFAULT 'unknown' NOT NULL;