CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`statement` text NOT NULL,
	`stance` text NOT NULL,
	`source_id` text,
	`file_id` text,
	`location` text NOT NULL,
	`quote` text NOT NULL,
	`status` text DEFAULT 'unreviewed' NOT NULL,
	`verification` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claims_lookup_idx` ON `claims` (`project`,`created`);