begin;

create extension if not exists pgcrypto;

do $$ begin
    create type content_status as enum (
        'IDEA', 'DRAFT', 'UNDER_REVIEW', 'NEEDS_CORRECTION',
        'REQUIRES_HUMAN_APPROVAL', 'APPROVED_AUTOMATICALLY', 'APPROVED',
        'SCHEDULED', 'PUBLISHED', 'REJECTED', 'ARCHIVED', 'FAILED'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type video_status as enum (
        'UPLOADING', 'UPLOADED', 'VALIDATING', 'QUEUED', 'PROCESSING',
        'PAUSED', 'COMPLETED', 'FAILED', 'ARCHIVED'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type clip_status as enum (
        'DETECTED', 'PROCESSING', 'DRAFT', 'UNDER_REVIEW', 'APPROVED',
        'SCHEDULED', 'PUBLISHED', 'REJECTED', 'ARCHIVED', 'FAILED'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type social_platform as enum ('facebook', 'instagram', 'tiktok');
exception when duplicate_object then null; end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function is_content_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'admin'),
        false
    );
$$;

create table if not exists content_settings (
    id uuid primary key default gen_random_uuid(),
    scope text not null default 'global' unique,
    settings jsonb not null,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint content_settings_object check (jsonb_typeof(settings) = 'object')
);

create table if not exists social_accounts (
    id uuid primary key default gen_random_uuid(),
    platform social_platform not null,
    external_account_id text not null,
    display_name text not null,
    status text not null default 'DISCONNECTED'
        check (status in ('DISCONNECTED', 'CONNECTED', 'EXPIRED', 'REQUIRES_REAUTH')),
    permissions text[] not null default '{}',
    token_secret_reference text,
    automation_enabled boolean not null default false,
    last_verified_at timestamptz,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (platform, external_account_id)
);

create table if not exists trend_sources (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    source_type text not null,
    url text,
    enabled boolean not null default true,
    collection_method text not null default 'manual'
        check (collection_method in ('api', 'rss', 'manual', 'first_party')),
    terms_notes text,
    last_checked_at timestamptz,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (name, source_type)
);

create table if not exists trends (
    id uuid primary key default gen_random_uuid(),
    source_id uuid references trend_sources(id) on delete set null,
    external_key text,
    name text not null,
    summary text,
    source_url text,
    source_snapshot jsonb not null default '{}',
    region text,
    language text default 'es',
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    expires_at timestamptz,
    status text not null default 'CANDIDATE'
        check (status in ('CANDIDATE', 'SELECTED', 'REJECTED', 'EXPIRED', 'BLOCKED')),
    content_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (content_hash)
);

create table if not exists trend_scores (
    id uuid primary key default gen_random_uuid(),
    trend_id uuid not null references trends(id) on delete cascade,
    relevance_score smallint not null check (relevance_score between 0 and 100),
    sales_potential smallint not null check (sales_potential between 0 and 100),
    messages_potential smallint not null check (messages_potential between 0 and 100),
    comments_potential smallint not null check (comments_potential between 0 and 100),
    local_interest smallint not null check (local_interest between 0 and 100),
    conversion_ease smallint not null check (conversion_ease between 0 and 100),
    product_availability smallint not null check (product_availability between 0 and 100),
    owned_media_availability smallint not null check (owned_media_availability between 0 and 100),
    originality_potential smallint not null check (originality_potential between 0 and 100),
    copyright_risk smallint not null check (copyright_risk between 0 and 100),
    trademark_risk smallint not null check (trademark_risk between 0 and 100),
    misinformation_risk smallint not null check (misinformation_risk between 0 and 100),
    production_difficulty smallint not null check (production_difficulty between 0 and 100),
    expected_duration smallint not null check (expected_duration between 0 and 100),
    overall_score numeric(5,2) not null check (overall_score between 0 and 100),
    recommendation text not null check (recommendation in ('create', 'review', 'reject')),
    recommended_formats text[] not null default '{}',
    model text,
    rationale text,
    scored_at timestamptz not null default now(),
    unique (trend_id, scored_at)
);

create table if not exists products (
    id uuid primary key default gen_random_uuid(),
    reference text not null unique,
    name text not null,
    category text not null,
    description text,
    compatible_colors text[] not null default '{}',
    materials text[] not null default '{}',
    variants jsonb not null default '[]',
    sizes jsonb not null default '[]',
    price_from numeric(12,2) check (price_from is null or price_from >= 0),
    fixed_price numeric(12,2) check (fixed_price is null or fixed_price >= 0),
    price_confirmed_at timestamptz,
    estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
    availability_status text not null default 'AVAILABLE'
        check (availability_status in ('AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'PAUSED', 'ARCHIVED')),
    sold_count integer not null default 0 check (sold_count >= 0),
    inquiry_count integer not null default 0 check (inquiry_count >= 0),
    popularity_score smallint not null default 0 check (popularity_score between 0 and 100),
    estimated_margin numeric(7,4),
    last_published_at timestamptz,
    publication_count integer not null default 0 check (publication_count >= 0),
    promotion_blocked_until timestamptz,
    stl_storage_path text,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint one_price_strategy check (fixed_price is null or price_from is null)
);

create table if not exists media_assets (
    id uuid primary key default gen_random_uuid(),
    storage_bucket text not null,
    storage_path text not null,
    original_filename text,
    media_type text not null check (media_type in ('image', 'video', 'audio', 'document', 'stl', 'subtitle')),
    mime_type text,
    byte_size bigint check (byte_size is null or byte_size >= 0),
    width integer,
    height integer,
    duration_ms bigint,
    checksum_sha256 text,
    ownership_status text not null default 'owned'
        check (ownership_status in ('owned', 'licensed', 'generated', 'customer_authorized')),
    privacy_status text not null default 'unchecked'
        check (privacy_status in ('unchecked', 'clear', 'restricted', 'blocked')),
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (storage_bucket, storage_path),
    unique (checksum_sha256)
);

create table if not exists product_media (
    product_id uuid not null references products(id) on delete cascade,
    media_asset_id uuid not null references media_assets(id) on delete restrict,
    role text not null default 'gallery'
        check (role in ('hero', 'gallery', 'process', 'finished', 'video', 'thumbnail')),
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    primary key (product_id, media_asset_id, role)
);

create table if not exists catalog_references (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    reference_type text not null,
    external_id text not null,
    source_system text not null,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    unique (source_system, reference_type, external_id)
);

create table if not exists brand_assets (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    asset_type text not null,
    media_asset_id uuid references media_assets(id) on delete restrict,
    values jsonb not null default '{}',
    approved boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists content_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    category text not null,
    format text not null,
    platform social_platform,
    template jsonb not null,
    approved_for_automation boolean not null default false,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists content_campaigns (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    objective text not null,
    status text not null default 'DRAFT'
        check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED')),
    starts_at timestamptz,
    ends_at timestamptz,
    budget numeric(12,2),
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint campaign_date_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists content_ideas (
    id uuid primary key default gen_random_uuid(),
    trend_id uuid references trends(id) on delete set null,
    product_id uuid references products(id) on delete set null,
    campaign_id uuid references content_campaigns(id) on delete set null,
    objective text not null,
    category text not null,
    concept text not null,
    target_audience text,
    recommended_formats text[] not null default '{}',
    recommendation_score numeric(5,2) check (recommendation_score between 0 and 100),
    status text not null default 'PROPOSED'
        check (status in ('PROPOSED', 'SELECTED', 'REJECTED', 'PRODUCED', 'ARCHIVED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists content_items (
    id uuid primary key default gen_random_uuid(),
    idea_id uuid references content_ideas(id) on delete set null,
    product_id uuid references products(id) on delete set null,
    campaign_id uuid references content_campaigns(id) on delete set null,
    trend_id uuid references trends(id) on delete set null,
    objective text not null,
    audience text,
    category text not null,
    format text not null,
    title text,
    primary_text text,
    call_to_action text,
    hashtags text[] not null default '{}',
    recommended_at timestamptz,
    status content_status not null default 'DRAFT',
    overall_score numeric(5,2) check (overall_score is null or overall_score between 0 and 100),
    review_passes integer not null default 0 check (review_passes >= 0),
    source_fingerprint text,
    content_fingerprint text,
    human_approval_required boolean not null default true,
    approved_by uuid references auth.users(id) on delete set null,
    approved_at timestamptz,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (content_fingerprint)
);

create table if not exists content_variants (
    id uuid primary key default gen_random_uuid(),
    content_item_id uuid not null references content_items(id) on delete cascade,
    platform social_platform not null,
    format text not null,
    caption text,
    title text,
    hashtags text[] not null default '{}',
    media_asset_ids uuid[] not null default '{}',
    technical_spec jsonb not null default '{}',
    status content_status not null default 'DRAFT',
    variant_fingerprint text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (platform, variant_fingerprint)
);

create table if not exists content_reviews (
    id uuid primary key default gen_random_uuid(),
    content_item_id uuid references content_items(id) on delete cascade,
    content_variant_id uuid references content_variants(id) on delete cascade,
    review_type text not null check (review_type in (
        'visual', 'spelling', 'commercial', 'brand', 'originality',
        'privacy', 'technical', 'business_potential'
    )),
    attempt integer not null default 1 check (attempt > 0),
    score smallint not null check (score between 0 and 100),
    passed boolean not null,
    findings jsonb not null default '[]',
    model text,
    reviewed_at timestamptz not null default now(),
    constraint review_target check (
        (content_item_id is not null)::integer +
        (content_variant_id is not null)::integer = 1
    )
);

create table if not exists content_corrections (
    id uuid primary key default gen_random_uuid(),
    review_id uuid not null references content_reviews(id) on delete cascade,
    correction_type text not null,
    attempt integer not null check (attempt > 0),
    before_snapshot jsonb,
    after_snapshot jsonb,
    status text not null default 'PENDING'
        check (status in ('PENDING', 'APPLIED', 'FAILED', 'HUMAN_REQUIRED')),
    error_message text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create table if not exists content_schedule (
    id uuid primary key default gen_random_uuid(),
    content_variant_id uuid not null references content_variants(id) on delete cascade,
    social_account_id uuid not null references social_accounts(id) on delete restrict,
    scheduled_for timestamptz not null,
    status text not null default 'SCHEDULED'
        check (status in ('SCHEDULED', 'PAUSED', 'PUBLISHING', 'PUBLISHED', 'SKIPPED', 'FAILED')),
    campaign_id uuid references content_campaigns(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (social_account_id, scheduled_for),
    unique (content_variant_id, social_account_id)
);

create table if not exists published_content (
    id uuid primary key default gen_random_uuid(),
    content_variant_id uuid not null references content_variants(id) on delete restrict,
    social_account_id uuid not null references social_accounts(id) on delete restrict,
    platform social_platform not null,
    external_id text not null,
    public_url text,
    published_at timestamptz not null,
    confirmed_at timestamptz,
    status text not null default 'PENDING_CONFIRMATION'
        check (status in ('PENDING_CONFIRMATION', 'PUBLISHED', 'FAILED', 'DELETED', 'UNKNOWN')),
    api_response jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (platform, external_id),
    unique (content_variant_id, social_account_id)
);

create table if not exists publication_attempts (
    id uuid primary key default gen_random_uuid(),
    content_schedule_id uuid references content_schedule(id) on delete cascade,
    content_variant_id uuid not null references content_variants(id) on delete restrict,
    social_account_id uuid not null references social_accounts(id) on delete restrict,
    idempotency_key text not null unique,
    attempt integer not null check (attempt > 0),
    status text not null check (status in ('STARTED', 'SUCCEEDED', 'FAILED', 'RETRY_SCHEDULED')),
    response_code integer,
    response_safe jsonb not null default '{}',
    error_code text,
    error_message text,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    next_retry_at timestamptz
);

create table if not exists social_metrics (
    id uuid primary key default gen_random_uuid(),
    published_content_id uuid not null references published_content(id) on delete cascade,
    captured_at timestamptz not null,
    views bigint not null default 0,
    reach bigint not null default 0,
    watch_time_ms bigint not null default 0,
    average_retention numeric(8,4),
    likes bigint not null default 0,
    comments bigint not null default 0,
    shares bigint not null default 0,
    saves bigint not null default 0,
    profile_visits bigint not null default 0,
    clicks bigint not null default 0,
    messages bigint not null default 0,
    quote_requests bigint not null default 0,
    sales bigint not null default 0,
    revenue numeric(12,2) not null default 0,
    raw_metrics jsonb not null default '{}',
    unique (published_content_id, captured_at)
);

create table if not exists content_attribution (
    id uuid primary key default gen_random_uuid(),
    published_content_id uuid references published_content(id) on delete set null,
    platform social_platform,
    campaign_id uuid references content_campaigns(id) on delete set null,
    product_id uuid references products(id) on delete set null,
    customer_external_id text,
    conversation_external_id text,
    quote_external_id text,
    order_external_id text,
    attribution_code text unique,
    event_type text not null check (event_type in ('MESSAGE', 'LEAD', 'QUOTE', 'SALE', 'REPEAT_SALE')),
    value numeric(12,2),
    occurred_at timestamptz not null default now(),
    metadata jsonb not null default '{}'
);

create table if not exists source_videos (
    id uuid primary key default gen_random_uuid(),
    media_asset_id uuid references media_assets(id) on delete set null,
    upload_id text not null unique,
    original_filename text not null,
    mime_type text,
    byte_size bigint not null check (byte_size >= 0),
    received_bytes bigint not null default 0 check (received_bytes >= 0),
    duration_ms bigint,
    checksum_sha256 text,
    storage_path text,
    proxy_storage_path text,
    status video_status not null default 'UPLOADING',
    progress smallint not null default 0 check (progress between 0 and 100),
    error_code text,
    error_message text,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint received_within_size check (received_bytes <= byte_size)
);

create table if not exists video_segments (
    id uuid primary key default gen_random_uuid(),
    source_video_id uuid not null references source_videos(id) on delete cascade,
    segment_index integer not null check (segment_index >= 0),
    start_ms bigint not null check (start_ms >= 0),
    end_ms bigint not null check (end_ms > start_ms),
    storage_path text,
    status text not null default 'QUEUED'
        check (status in ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    analysis jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source_video_id, segment_index)
);

create table if not exists video_transcripts (
    id uuid primary key default gen_random_uuid(),
    source_video_id uuid not null references source_videos(id) on delete cascade,
    video_segment_id uuid references video_segments(id) on delete cascade,
    start_ms bigint not null check (start_ms >= 0),
    end_ms bigint not null check (end_ms > start_ms),
    language text,
    text text not null,
    confidence numeric(5,4),
    words jsonb not null default '[]',
    created_at timestamptz not null default now()
);

create table if not exists detected_moments (
    id uuid primary key default gen_random_uuid(),
    source_video_id uuid not null references source_videos(id) on delete cascade,
    video_segment_id uuid references video_segments(id) on delete cascade,
    moment_type text not null,
    start_ms bigint not null check (start_ms >= 0),
    end_ms bigint not null check (end_ms > start_ms),
    score numeric(5,2) not null check (score between 0 and 100),
    product_id uuid references products(id) on delete set null,
    evidence jsonb not null default '{}',
    privacy_risk boolean not null default false,
    duplicate_group text,
    created_at timestamptz not null default now()
);

create table if not exists video_clips (
    id uuid primary key default gen_random_uuid(),
    source_video_id uuid not null references source_videos(id) on delete cascade,
    detected_moment_id uuid references detected_moments(id) on delete set null,
    product_id uuid references products(id) on delete set null,
    start_ms bigint not null check (start_ms >= 0),
    end_ms bigint not null check (end_ms > start_ms),
    duration_ms bigint generated always as (end_ms - start_ms) stored,
    topic text,
    hook text,
    on_screen_text text,
    caption text,
    recommended_platforms social_platform[] not null default '{}',
    score numeric(5,2) check (score is null or score between 0 and 100),
    status clip_status not null default 'DETECTED',
    fingerprint text not null,
    published_at timestamptz,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source_video_id, fingerprint)
);

create table if not exists clip_versions (
    id uuid primary key default gen_random_uuid(),
    video_clip_id uuid not null references video_clips(id) on delete cascade,
    version integer not null check (version > 0),
    style text not null,
    platform social_platform,
    media_asset_id uuid references media_assets(id) on delete restrict,
    subtitle_asset_id uuid references media_assets(id) on delete restrict,
    cover_asset_id uuid references media_assets(id) on delete restrict,
    render_settings jsonb not null default '{}',
    quality_score numeric(5,2) check (quality_score is null or quality_score between 0 and 100),
    status clip_status not null default 'DRAFT',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (video_clip_id, version, platform)
);

create table if not exists content_errors (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,
    entity_id uuid,
    workflow text,
    severity text not null check (severity in ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    error_code text not null,
    message text not null,
    safe_context jsonb not null default '{}',
    retryable boolean not null default false,
    retry_count integer not null default 0 check (retry_count >= 0),
    next_retry_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists audit_logs (
    id bigint generated always as identity primary key,
    actor_id uuid references auth.users(id) on delete set null,
    actor_type text not null default 'system',
    action text not null,
    entity_type text not null,
    entity_id text,
    before_data jsonb,
    after_data jsonb,
    request_id text,
    created_at timestamptz not null default now()
);

create index if not exists trends_status_score_idx on trends (status, last_seen_at desc);
create index if not exists trend_scores_candidate_idx on trend_scores (overall_score desc, scored_at desc);
create index if not exists products_availability_idx on products (availability_status, promotion_blocked_until);
create index if not exists content_items_queue_idx on content_items (status, recommended_at);
create index if not exists content_items_product_idx on content_items (product_id, created_at desc);
create index if not exists content_reviews_target_idx on content_reviews (content_item_id, content_variant_id, review_type);
create index if not exists content_schedule_due_idx on content_schedule (status, scheduled_for);
create index if not exists published_content_platform_idx on published_content (platform, published_at desc);
create index if not exists social_metrics_content_idx on social_metrics (published_content_id, captured_at desc);
create index if not exists attribution_conversion_idx on content_attribution (event_type, occurred_at desc);
create index if not exists source_videos_queue_idx on source_videos (status, created_at);
create index if not exists video_segments_queue_idx on video_segments (status, source_video_id, segment_index);
create index if not exists detected_moments_score_idx on detected_moments (source_video_id, score desc);
create index if not exists video_clips_library_idx on video_clips (status, product_id, created_at desc);
create index if not exists content_errors_unresolved_idx on content_errors (severity, created_at desc) where resolved_at is null;
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'content_settings', 'social_accounts', 'trend_sources', 'trends',
        'trend_scores', 'products', 'media_assets', 'product_media',
        'catalog_references', 'brand_assets', 'content_templates',
        'content_campaigns', 'content_ideas', 'content_items', 'content_variants',
        'content_reviews', 'content_corrections', 'content_schedule',
        'published_content', 'publication_attempts', 'social_metrics',
        'content_attribution', 'source_videos', 'video_segments',
        'video_transcripts', 'detected_moments', 'video_clips', 'clip_versions',
        'content_errors', 'audit_logs'
    ] loop
        execute format('alter table %I enable row level security', table_name);
        execute format(
            'create policy %I on %I for all to authenticated using (is_content_admin()) with check (is_content_admin())',
            table_name || '_admin_all',
            table_name
        );
    end loop;
exception
    when duplicate_object then null;
end $$;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'content_settings', 'social_accounts', 'trend_sources', 'trends',
        'products', 'media_assets', 'brand_assets', 'content_templates',
        'content_campaigns', 'content_ideas', 'content_items', 'content_variants',
        'content_schedule', 'published_content', 'source_videos', 'video_segments',
        'video_clips', 'clip_versions'
    ] loop
        execute format(
            'create trigger %I before update on %I for each row execute function set_updated_at()',
            table_name || '_set_updated_at',
            table_name
        );
    end loop;
exception
    when duplicate_object then null;
end $$;

insert into content_settings (scope, settings)
values (
    'global',
    '{
      "enabled": true,
      "autoPublish": false,
      "timezone": "America/El_Salvador",
      "approvalMode": "manual",
      "minimumTrendScore": 70,
      "thresholds": {"automaticApproval": 95, "humanApproval": 85},
      "maxCorrectionAttempts": 3,
      "reuseCooldownDays": 15,
      "dailyTargets": {
        "staticPosts": 4,
        "carousels": 0,
        "stories": 2,
        "reels": 1,
        "tiktokVideos": 1,
        "facebookPosts": 4,
        "instagramPosts": 4
      },
      "platformAutomation": {"facebook": false, "instagram": false, "tiktok": false},
      "preferredTimes": {
        "facebook": ["09:00", "12:30", "15:30", "20:00"],
        "instagram": ["09:00", "12:30", "18:30", "20:00"],
        "tiktok": ["18:30"]
      },
      "restDays": [],
      "retentionDays": 30,
      "video": {"maxUploadBytes": 53687091200, "chunkBytes": 8388608, "maxConcurrentJobs": 1}
    }'::jsonb
)
on conflict (scope) do nothing;

insert into trend_sources (name, source_type, collection_method, terms_notes)
values
    ('Carga manual del propietario', 'manual', 'manual', 'Enlaces y observaciones añadidos desde el panel.'),
    ('Catálogo y CRM PixelLabs', 'first_party', 'first_party', 'Consultas y productos propios; no contiene contenido de terceros.')
on conflict (name, source_type) do nothing;

insert into products (
    reference, name, category, description, compatible_colors, materials,
    price_from, availability_status, metadata
)
values (
    'LLV-024',
    'Llavero personalizado con nombre',
    'Llaveros',
    'Llavero personalizado de hasta cuatro colores.',
    array['Negro', 'Blanco', 'Gris', 'Gris oscuro', 'Rosa', 'Turquesa', 'Verde brillante', 'Verde bambú', 'Café'],
    array['PLA'],
    2.50,
    'AVAILABLE',
    '{"max_colors": 4, "source": "verified_business_context"}'::jsonb
)
on conflict (reference) do nothing;

commit;
