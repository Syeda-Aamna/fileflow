CREATE TABLE `public_files` (
	`id` varchar(36) NOT NULL,
	`fileName` varchar(180) NOT NULL,
	`fileType` varchar(128) NOT NULL,
	`fileSize` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`publicUrl` varchar(640) NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_files_storageKey_unique` UNIQUE(`storageKey`)
);
