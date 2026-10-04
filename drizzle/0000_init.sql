CREATE TYPE "public"."attendee_source" AS ENUM('poll', 'rsvp');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('close_poll', 'remind_before', 'remind_day_of');--> statement-breakpoint
CREATE TYPE "public"."poll_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rehearsal_status" AS ENUM('scheduled', 'cancelled', 'done');--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"answer_id" integer NOT NULL,
	"emoji" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"poll_option_id" integer NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "poll_votes_poll_option_id_user_id_pk" PRIMARY KEY("poll_option_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rehearsal_attendees" (
	"rehearsal_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"source" "attendee_source" NOT NULL,
	CONSTRAINT "rehearsal_attendees_rehearsal_id_user_id_pk" PRIMARY KEY("rehearsal_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rehearsal_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"created_by" text NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" "poll_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rehearsals" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_option_id" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "rehearsal_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "job_kind" NOT NULL,
	"ref_id" integer NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_rehearsal_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."rehearsal_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_option_id_poll_options_id_fk" FOREIGN KEY ("poll_option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsal_attendees" ADD CONSTRAINT "rehearsal_attendees_rehearsal_id_rehearsals_id_fk" FOREIGN KEY ("rehearsal_id") REFERENCES "public"."rehearsals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsals" ADD CONSTRAINT "rehearsals_poll_option_id_poll_options_id_fk" FOREIGN KEY ("poll_option_id") REFERENCES "public"."poll_options"("id") ON DELETE no action ON UPDATE no action;