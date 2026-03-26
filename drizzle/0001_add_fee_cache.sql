CREATE TABLE `fee_cache` (
	`market` text PRIMARY KEY NOT NULL,
	`buy_fee_ubps` integer,
	`sell_fee_ubps` integer,
	`borrow_fee_ubps` integer,
	`exercise_option_fee_ubps` integer,
	`sell_fee_ratio` real,
	`updated_at` integer NOT NULL
);
