CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`cuisine` text,
	`area` text,
	`address` text,
	`price_level` integer,
	`notes` text,
	`source` text NOT NULL,
	`url` text,
	`status` text NOT NULL,
	`last_visited_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `places_name_key_idx` ON `places` (`name_key`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`status`);--> statement-breakpoint
CREATE INDEX `places_area_idx` ON `places` (`area`);--> statement-breakpoint
CREATE INDEX `places_cuisine_idx` ON `places` (`cuisine`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `place_tags` (
	`place_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_tags_pk` ON `place_tags` (`place_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `place_tags_tag_idx` ON `place_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `place_tags_place_idx` ON `place_tags` (`place_id`);--> statement-breakpoint
CREATE TABLE `dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dishes_place_idx` ON `dishes` (`place_id`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`visited_at` text NOT NULL,
	`note` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `visits_place_idx` ON `visits` (`place_id`);--> statement-breakpoint
CREATE TABLE `place_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`url` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `place_sources_place_source_idx` ON `place_sources` (`place_id`,`source`);--> statement-breakpoint
CREATE INDEX `place_sources_source_idx` ON `place_sources` (`source`);
