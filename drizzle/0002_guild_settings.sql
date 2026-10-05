CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"guide_channel_id" text,
	"guide_message_ids" text[] DEFAULT '{}'::text[] NOT NULL
);
