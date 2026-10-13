CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`key` text NOT NULL,
	`status` text NOT NULL,
	`upload_id` text,
	`parts` text DEFAULT '[]' NOT NULL,
	`extracted` text,
	`sha256` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`model` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`content` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`question` text DEFAULT '' NOT NULL,
	`criteria` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`title` text NOT NULL,
	`doi` text,
	`url` text,
	`authors` text DEFAULT '' NOT NULL,
	`year` integer,
	`abstract` text DEFAULT '' NOT NULL,
	`origin` text NOT NULL,
	`external_id` text,
	`stage` text DEFAULT 'title_abstract' NOT NULL,
	`decision` text DEFAULT 'unknown' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`kind` text NOT NULL,
	`args` text NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`error` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
