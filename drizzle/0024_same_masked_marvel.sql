CREATE TABLE `otp_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`officialEmail` varchar(320) NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `otp_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `otp_challenges_email_created_idx` ON `otp_challenges` (`officialEmail`,`createdAt`);--> statement-breakpoint
CREATE INDEX `otp_challenges_expires_idx` ON `otp_challenges` (`expiresAt`);
