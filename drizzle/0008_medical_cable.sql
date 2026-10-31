CREATE TABLE `screening_decisions` (
	`round_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`decision` text,
	`reason` text NOT NULL,
	`revision` integer NOT NULL,
	`edit_token` text NOT NULL,
	`submitted` integer,
	PRIMARY KEY(`round_id`, `reviewer`)
);
--> statement-breakpoint
CREATE TABLE `screening_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`round_id` text,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `screening_events_project_idx` ON `screening_events` (`project`,`created`);--> statement-breakpoint
CREATE TABLE `screening_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`expires` integer NOT NULL,
	`created_by` text NOT NULL,
	`accepted_by` text,
	`edit_token` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `screening_invitation_token_idx` ON `screening_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `screening_invitation_project_idx` ON `screening_invitations` (`project`,`created`);--> statement-breakpoint
CREATE TABLE `screening_members` (
	`project` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`edit_token` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`project`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `screening_members_user_idx` ON `screening_members` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `screening_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`source_id` text NOT NULL,
	`stage` text NOT NULL,
	`round` integer NOT NULL,
	`active_key` text,
	`snapshot` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`reviewer_a` text NOT NULL,
	`reviewer_b` text NOT NULL,
	`generation_a` integer NOT NULL,
	`generation_b` integer NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`final_decision` text,
	`final_reason` text,
	`resolved_by` text,
	`edit_token` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `screening_active_round_idx` ON `screening_rounds` (`project`,`active_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `screening_round_number_idx` ON `screening_rounds` (`project`,`source_id`,`stage`,`round`);--> statement-breakpoint
CREATE INDEX `screening_rounds_project_idx` ON `screening_rounds` (`project`,`created`);