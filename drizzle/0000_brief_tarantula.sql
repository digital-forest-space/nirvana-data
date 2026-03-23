CREATE TABLE `nav_markets` (
	`name` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`base_name` text NOT NULL,
	`base_mint` text NOT NULL,
	`nav_mint` text NOT NULL,
	`samsara_market` text NOT NULL,
	`mayflower_market` text NOT NULL,
	`market_metadata` text NOT NULL,
	`market_group` text NOT NULL,
	`market_sol_vault` text NOT NULL,
	`market_nav_vault` text NOT NULL,
	`fee_vault` text NOT NULL,
	`authority_pda` text NOT NULL,
	`base_decimals` integer NOT NULL,
	`nav_decimals` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_cache` (
	`market` text PRIMARY KEY NOT NULL,
	`price` real NOT NULL,
	`floor` real NOT NULL,
	`fee` real,
	`currency` text NOT NULL,
	`price_signature` text NOT NULL,
	`checkpoint_signature` text NOT NULL,
	`updated_at` integer NOT NULL
);
