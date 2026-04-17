CREATE TABLE "admin_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agreements_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "application_statuses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#9CA3AF' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "availability_edit_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" varchar NOT NULL,
	"edit_type" text NOT NULL,
	"edited_by" text NOT NULL,
	"edited_by_name" text,
	"previous_value" jsonb,
	"new_value" jsonb,
	"summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "crate_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crate_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"map_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dropout_surveys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reasons" text[] NOT NULL,
	"comment" text,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"suggested_template_id" varchar,
	"similarity_score" numeric(5, 4),
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscribers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'coming_soon' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "host_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text DEFAULT 'etransfer' NOT NULL,
	"memo" text,
	"period_start" text,
	"period_end" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar NOT NULL,
	"node_id" varchar NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"sheet_id" text,
	"sheet_name" text,
	"sheet_row" integer,
	"source_url" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"cost_price" numeric(10, 2),
	"purchase_date" text,
	"batch_notes" text,
	"node_id" varchar,
	"status" text DEFAULT 'available' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"node_name" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by_user_id" varchar,
	"created_by_user_id" varchar NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"product_id" text NOT NULL,
	"mode" text DEFAULT 'single' NOT NULL,
	"product_ids" text[],
	"node_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"headline" text,
	"subheadline" text,
	"show_price" boolean DEFAULT true,
	"show_description" boolean DEFAULT true,
	"show_condition" boolean DEFAULT false,
	"show_brand" boolean DEFAULT false,
	"promo_codes" text[],
	"promo_title" text,
	"shop_more_mode" text DEFAULT 'subcategory',
	"shop_more_product_ids" text[],
	"gradient_from" text DEFAULT '#0d9488',
	"gradient_to" text DEFAULT '#1e3a5f',
	"cta_text" text DEFAULT 'Find My Pickup Spot',
	"cta_color" text DEFAULT '#14b8a6',
	"layout_order" text[],
	"headline_font_size" integer,
	"subheadline_font_size" integer,
	"price_font_size" integer,
	"carousel_product_ids" text[],
	"carousel_enabled" boolean DEFAULT true,
	"carousel_autoplay" boolean DEFAULT false,
	"carousel_speed" integer DEFAULT 3,
	"carousel_visible_count" integer DEFAULT 3,
	"shop_more_text" text,
	"shop_more_link" text,
	"show_map_circle" boolean DEFAULT true,
	"map_circle_size" integer DEFAULT 500,
	"group_by_category" boolean DEFAULT true,
	"show_subcategories" boolean DEFAULT false,
	"textbox_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landing_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "listing_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"include_name" boolean DEFAULT false,
	"include_description" boolean DEFAULT false,
	"include_price" boolean DEFAULT false,
	"include_category" boolean DEFAULT false,
	"include_condition" boolean DEFAULT false,
	"include_images" boolean DEFAULT false,
	"include_colors" boolean DEFAULT false,
	"product_name" text,
	"description" text,
	"price" text,
	"category" text,
	"condition" text,
	"images" text[],
	"colors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"content" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"city_neighborhood" text NOT NULL,
	"node_type" text NOT NULL,
	"availability_window" text NOT NULL,
	"late_availability_7pm" boolean NOT NULL,
	"late_availability_9pm" boolean NOT NULL,
	"storage_size" text NOT NULL,
	"prepaid_agreement" boolean NOT NULL,
	"can_store_crate" text,
	"comfortable_meeting_outside" text,
	"comfortable_adjusting_availability" text,
	"can_pause_handoffs" text,
	"additional_notes" text,
	"screening_answers" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"onboarding_status" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" varchar NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"enabled" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "node_bundles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" varchar NOT NULL,
	"bundle_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"month" text NOT NULL,
	"dropped_at" timestamp DEFAULT now() NOT NULL,
	"returned_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "node_crate_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crate_id" varchar NOT NULL,
	"node_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"quantity_overrides" jsonb
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"serving_city_id" varchar,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"pickup_instructions" text,
	"rating" numeric(3, 2) DEFAULT '4.5',
	"total_handoffs" integer DEFAULT 0,
	"monthly_fee" numeric(10, 2) DEFAULT '55.00',
	"earnings_per_handoff" numeric(10, 2) DEFAULT '2.50',
	"kit_count" integer DEFAULT 0,
	"kit_fee" numeric(10, 2) DEFAULT '55.00',
	"status" text DEFAULT 'active' NOT NULL,
	"availability_notice_hours" integer DEFAULT 48,
	"minimum_availability_hours" integer DEFAULT 4,
	"is_admin_node" boolean DEFAULT false,
	"handoff_tiers" jsonb,
	"availability_overrides" jsonb,
	"notification_phone" text,
	"google_store_code" text,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"link" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"node_id" varchar NOT NULL,
	"host_rating" integer NOT NULL,
	"overall_rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" varchar,
	"node_id" varchar,
	"status" text DEFAULT 'paid' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"pickup_code" text NOT NULL,
	"pickup_date" text,
	"pickup_time" text,
	"buyer_name" text,
	"buyer_email" text,
	"buyer_phone" text,
	"sms_sent" boolean DEFAULT false,
	"host_notified_at" timestamp,
	"last_reminder_sent_at" timestamp,
	"reminder_count" integer DEFAULT 0,
	"stripe_payment_intent_id" text,
	"refunded_amount" numeric(10, 2) DEFAULT '0',
	"promo_code" text,
	"subtotal" numeric(10, 2),
	"discount_amount" numeric(10, 2) DEFAULT '0',
	"gift_product_ids" text[],
	"sale_source" text DEFAULT 'online',
	"payment_method" text,
	"sale_notes" text,
	"ready_at" timestamp,
	"customer_arrived_at" timestamp,
	"picked_up_at" timestamp,
	"host_notification_queued" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"memo" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"url" text,
	"customer_email" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_verification_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phone_verification_codes_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "primary_screening_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"question_type" text DEFAULT 'text' NOT NULL,
	"options" text[],
	"has_other_option" boolean DEFAULT false,
	"is_required" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"field_key" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"images" text[],
	"category" text NOT NULL,
	"subcategory" text,
	"condition" text DEFAULT 'new',
	"colors" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_templates_product_code_unique" UNIQUE("product_code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"cost_price" numeric(10, 2),
	"image" text NOT NULL,
	"images" text[],
	"videos" text[],
	"category" text NOT NULL,
	"subcategory" text,
	"condition" text DEFAULT 'New',
	"sku" text,
	"product_code" text,
	"canonical_product_id" varchar,
	"parent_product_id" varchar,
	"relationship_type" text DEFAULT 'variant',
	"variant_suffix" text,
	"variant_name" text,
	"sheet_row" integer,
	"sheet_source" text,
	"source_url" text,
	"purchase_date" text,
	"sheet_quantity" integer DEFAULT 0,
	"brand" text,
	"custom_handoff_fee" numeric(10, 2),
	"customer_pays_handoff" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"coming_soon" boolean DEFAULT false,
	"image_overlays" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "promo_code_usages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"order_id" varchar,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"min_order_amount" numeric(10, 2),
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"max_uses_per_customer" integer DEFAULT 1,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"stackable" boolean DEFAULT false,
	"gift_product_ids" text[],
	"gift_quantity" integer DEFAULT 1,
	"gift_pool_size" integer,
	"gift_select_count" integer,
	"benefits" jsonb,
	"assigned_node_id" varchar,
	"node_only" boolean DEFAULT false,
	"batch_id" text,
	"given_out" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "saved_qr_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"link_type" text NOT NULL,
	"custom_url" text,
	"data_url" text NOT NULL,
	"size" integer DEFAULT 300 NOT NULL,
	"fg_color" text DEFAULT '#1D3557' NOT NULL,
	"bg_color" text DEFAULT '#FFFFFF' NOT NULL,
	"border_enabled" boolean DEFAULT false,
	"border_color" text DEFAULT '#1D3557',
	"border_width" integer DEFAULT 8,
	"corner_radius" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" varchar,
	"name" varchar,
	"email" varchar,
	"token" text NOT NULL,
	"expires_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "screening_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "screening_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"question_type" text DEFAULT 'text' NOT NULL,
	"options" text[],
	"elaboration_options" text[],
	"is_required" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serving_cities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"province" text NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"map_lat" text,
	"map_lng" text,
	"map_zoom" text,
	"is_available" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "social_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_fb_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"schedule" text NOT NULL,
	"schedule_days" text[],
	"assigned_day" text,
	"notes" text,
	"labels" jsonb,
	"category_id" varchar,
	"fb_account_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"content" text,
	"image_url" text,
	"group_ids" text[],
	"group_details" jsonb,
	"category_id" varchar,
	"fb_account_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spreadsheet_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"spreadsheet_name" text,
	"last_sync_at" timestamp,
	"last_synced_row" integer DEFAULT 0,
	"use_title_from_sheet" boolean DEFAULT false,
	"use_pictures_from_sheet" boolean DEFAULT false,
	"last_sync_log" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_options" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" varchar NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" varchar NOT NULL,
	"reasons" text[] NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"allow_multiple" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"postal_code" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_label_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"label_size" text NOT NULL,
	"template" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"key" varchar NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"name" text NOT NULL,
	"phone" text,
	"sms_opt_in" boolean DEFAULT false,
	"email_opt_in" boolean DEFAULT true,
	"type" text NOT NULL,
	"roles" text[],
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "availability_edit_history" ADD CONSTRAINT "availability_edit_history_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crate_items" ADD CONSTRAINT "crate_items_crate_id_crates_id_fk" FOREIGN KEY ("crate_id") REFERENCES "public"."crates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crate_items" ADD CONSTRAINT "crate_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_queue" ADD CONSTRAINT "duplicate_queue_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_queue" ADD CONSTRAINT "duplicate_queue_suggested_template_id_product_templates_id_fk" FOREIGN KEY ("suggested_template_id") REFERENCES "public"."product_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_payments" ADD CONSTRAINT "host_payments_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_template_id_product_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."product_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_availability" ADD CONSTRAINT "node_availability_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_bundles" ADD CONSTRAINT "node_bundles_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_bundles" ADD CONSTRAINT "node_bundles_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_crate_assignments" ADD CONSTRAINT "node_crate_assignments_crate_id_crates_id_fk" FOREIGN KEY ("crate_id") REFERENCES "public"."crates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_crate_assignments" ADD CONSTRAINT "node_crate_assignments_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_serving_city_id_serving_cities_id_fk" FOREIGN KEY ("serving_city_id") REFERENCES "public"."serving_cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_feedback" ADD CONSTRAINT "order_feedback_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_usages" ADD CONSTRAINT "promo_code_usages_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_usages" ADD CONSTRAINT "promo_code_usages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_usages" ADD CONSTRAINT "promo_code_usages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_assigned_node_id_nodes_id_fk" FOREIGN KEY ("assigned_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_links" ADD CONSTRAINT "screening_links_application_id_node_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."node_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_responses" ADD CONSTRAINT "screening_responses_link_id_screening_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."screening_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_responses" ADD CONSTRAINT "screening_responses_question_id_screening_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."screening_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_options" ADD CONSTRAINT "survey_options_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_label_templates" ADD CONSTRAINT "user_label_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_inventory_product_node" ON "inventory" USING btree ("product_id","node_id");