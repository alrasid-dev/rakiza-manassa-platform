ALTER TABLE `tasks` ADD `cancellationReason` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `isOpen` boolean DEFAULT false NOT NULL;