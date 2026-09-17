ALTER TABLE `tasks` ADD `taskType` enum('permanent','urgent') DEFAULT 'permanent' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `isPinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `taskNotes` text;