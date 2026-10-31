CREATE TABLE `review_revisions` (
	`project` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`sha256` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`project`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `review_workspaces` (
	`project` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer NOT NULL,
	`edit_token` text NOT NULL,
	`updated` integer NOT NULL
);
