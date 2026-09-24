ALTER TABLE `places` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `places` ADD `lng` real;--> statement-breakpoint
CREATE TABLE `geocodes` (
	`query` text PRIMARY KEY NOT NULL,
	`lat` real,
	`lng` real,
	`label` text,
	`updated_at` text NOT NULL
);
