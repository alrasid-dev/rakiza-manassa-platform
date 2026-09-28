ALTER TABLE `leave_requests` MODIFY COLUMN `status` enum('pending','approved','rejected','active','completed','pending_owner_approval') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `hijriMonthKey` varchar(10);--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `requestSequenceInMonth` int DEFAULT 0 NOT NULL;