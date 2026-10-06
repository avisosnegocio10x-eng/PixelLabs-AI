begin;

-- Extends the existing architecture. Never replaces the five original migrations.
create unique index if not exists content_generation_key_unique
    on public.content_items ((metadata->>'generationKey')) where metadata ? 'generationKey';
alter table public.content_schedule add column if not exists execution_mode text not null default 'dry-run';
alter table public.content_schedule add column if not exists approval_fingerprint text;
alter table public.content_schedule add column if not exists idempotency_key text;
alter table public.content_schedule add column if not exists lease_expires_at timestamptz;
alter table public.published_content add column if not exists is_simulated boolean not null default false;
alter table public.social_metrics add column if not exists impressions bigint not null default 0 check (impressions >= 0);
do $$ begin
    alter table public.content_schedule add constraint schedule_execution_mode_check
        check (execution_mode in ('dry-run', 'live'));
exception when duplicate_object then null; end $$;
create unique index if not exists content_schedule_idempotency_unique on public.content_schedule(idempotency_key);
create index if not exists content_schedule_due_mode_idx on public.content_schedule(execution_mode, status, scheduled_for);

create table if not exists public.content_ai_usage (
    id uuid primary key default gen_random_uuid(),
    request_key text not null unique,
    purpose text not null,
    reserved_at timestamptz not null default now()
);
alter table public.content_ai_usage enable row level security;
revoke all on public.content_ai_usage from anon, authenticated;
grant select, insert on public.content_ai_usage to service_role;
create index if not exists content_ai_usage_day_idx on public.content_ai_usage(reserved_at);

create or replace function public.content_reserve_ai_request(p_key text, p_purpose text, p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare used integer;
begin
    if p_limit < 1 or p_limit > 100 then raise exception 'INVALID_AI_DAILY_LIMIT'; end if;
    perform pg_advisory_xact_lock(68260811);
    if exists(select 1 from public.content_ai_usage where request_key = p_key) then return true; end if;
    select count(*) into used from public.content_ai_usage
        where reserved_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    if used >= p_limit then return false; end if;
    insert into public.content_ai_usage(request_key, purpose) values (p_key, left(p_purpose, 250));
    return true;
end $$;

create or replace function public.content_queue_dry_run(
    p_content_id uuid, p_account_id uuid, p_platform public.social_platform,
    p_scheduled_for timestamptz, p_format text, p_caption text, p_title text, p_hashtags text[],
    p_media_ids uuid[], p_fingerprint text, p_approval text, p_max_daily integer,
    p_day_start timestamptz, p_day_end timestamptz, p_min_gap integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.content_items; account public.social_accounts; variant_id uuid;
    result public.content_schedule; settings jsonb;
begin
    select * into item from public.content_items where id = p_content_id for update;
    select * into account from public.social_accounts where id = p_account_id for update;
    select cs.settings into settings from public.content_settings cs where scope = 'global';
    if coalesce((settings->>'enabled')::boolean, false) is not true then raise exception 'ENGINE_STOPPED'; end if;
    if coalesce(p_approval, '') = '' or item.id is null or item.status <> 'APPROVED' or item.approved_at is null or
        coalesce((item.metadata->>'manuallyApproved')::boolean, false) is not true or
        (item.metadata->>'approvalFingerprint') is distinct from p_approval then
        raise exception 'CONTENT_NOT_MANUALLY_APPROVED';
    end if;
    if account.id is null or account.platform <> p_platform or account.metadata->>'mode' is distinct from 'dry-run'
        then raise exception 'DRY_RUN_ACCOUNT_REQUIRED'; end if;
    if not exists(select 1 from public.products where id = item.product_id
        and availability_status in ('AVAILABLE', 'LOW_STOCK')) then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if coalesce(cardinality(p_media_ids), 0) = 0 or coalesce(item.metadata->'mediaAssetIds', '[]'::jsonb) <> to_jsonb(p_media_ids)
        or exists(select 1 from unnest(p_media_ids) aid where not exists(select 1 from public.media_assets m
            where m.id = aid and m.ownership_status in ('owned','licensed','customer_authorized')
            and m.privacy_status = 'clear' and m.checksum_sha256 is not null))
        then raise exception 'VERIFIED_MEDIA_REQUIRED'; end if;
    select cs.* into result from public.content_schedule cs where idempotency_key = p_fingerprint;
    if found then return to_jsonb(result); end if;
    if p_max_daily < 1 or p_max_daily > 20 or p_min_gap < 60 or p_day_end <= p_day_start or
        p_scheduled_for < p_day_start or p_scheduled_for >= p_day_end then raise exception 'INVALID_SCHEDULE_LIMITS'; end if;
    if (select count(*) from public.content_schedule where social_account_id = p_account_id
        and scheduled_for >= p_day_start and scheduled_for < p_day_end and status <> 'SKIPPED') >= p_max_daily
        then raise exception 'DAILY_PUBLICATION_LIMIT'; end if;
    if exists(select 1 from public.content_schedule where social_account_id = p_account_id and status <> 'SKIPPED'
        and abs(extract(epoch from (scheduled_for - p_scheduled_for))) < p_min_gap)
        then raise exception 'PUBLICATION_INTERVAL_LIMIT'; end if;
    insert into public.content_variants(content_item_id, platform, format, caption, title, hashtags,
        media_asset_ids, technical_spec, status, variant_fingerprint)
        values(p_content_id, p_platform, p_format, p_caption, p_title, p_hashtags, p_media_ids,
            jsonb_build_object('mode', 'dry-run', 'approvalFingerprint', p_approval), 'APPROVED', p_fingerprint)
        on conflict (platform, variant_fingerprint) do nothing;
    select id into variant_id from public.content_variants where platform = p_platform and variant_fingerprint = p_fingerprint;
    insert into public.content_schedule(content_variant_id, social_account_id, scheduled_for,
        execution_mode, approval_fingerprint, idempotency_key)
        values(variant_id, p_account_id, p_scheduled_for, 'dry-run', p_approval, p_fingerprint)
        returning * into result;
    return to_jsonb(result);
end $$;

create or replace function public.content_claim_dry_run(p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result public.content_schedule;
begin
    select * into result from public.content_schedule where execution_mode = 'dry-run'
        and scheduled_for <= p_now and (status = 'SCHEDULED' or
            (status = 'PUBLISHING' and lease_expires_at < p_now))
        order by scheduled_for for update skip locked limit 1;
    if not found then return null; end if;
    update public.content_schedule set status = 'PUBLISHING', lease_expires_at = p_now + interval '2 minutes'
        where id = result.id returning * into result;
    return to_jsonb(result);
end $$;

create or replace function public.content_finish_dry_run(p_schedule_id uuid, p_external_id text, p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare schedule public.content_schedule; variant public.content_variants; result public.published_content;
    item public.content_items; settings jsonb;
begin
    select * into schedule from public.content_schedule where id = p_schedule_id for update;
    if schedule.id is null or schedule.execution_mode <> 'dry-run' or schedule.status <> 'PUBLISHING'
        then raise exception 'SCHEDULE_NOT_CLAIMED'; end if;
    if left(p_external_id, 8) is distinct from 'dry-run:' then raise exception 'SIMULATED_EXTERNAL_ID_REQUIRED'; end if;
    select * into variant from public.content_variants where id = schedule.content_variant_id;
    select * into item from public.content_items where id = variant.content_item_id for update;
    select cs.settings into settings from public.content_settings cs where scope = 'global' for share;
    if coalesce((settings->>'enabled')::boolean, false) is not true then raise exception 'ENGINE_STOPPED'; end if;
    if item.status <> 'APPROVED' or item.approved_at is null or
        item.metadata->>'approvalFingerprint' is distinct from schedule.approval_fingerprint
        or coalesce((item.metadata->>'manuallyApproved')::boolean, false) is not true
        then raise exception 'CONTENT_NOT_MANUALLY_APPROVED'; end if;
    perform 1 from public.products where id = item.product_id and availability_status in ('AVAILABLE', 'LOW_STOCK') for share;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if coalesce(cardinality(variant.media_asset_ids), 0) = 0 or
        item.metadata->'mediaAssetIds' is distinct from to_jsonb(variant.media_asset_ids) or
        exists(select 1 from unnest(variant.media_asset_ids) aid where not exists(select 1 from public.media_assets m
            where m.id = aid and m.ownership_status in ('owned','licensed','customer_authorized')
            and m.privacy_status = 'clear' and m.checksum_sha256 is not null))
        then raise exception 'VERIFIED_MEDIA_REQUIRED'; end if;
    insert into public.publication_attempts(content_schedule_id, content_variant_id, social_account_id,
        idempotency_key, attempt, status, response_safe, finished_at)
        values(schedule.id, variant.id, schedule.social_account_id, schedule.idempotency_key, 1,
            'SUCCEEDED', '{"simulated":true,"externalRequestsSent":0}', p_now)
        on conflict (idempotency_key) do nothing;
    insert into public.published_content(content_variant_id, social_account_id, platform,
        external_id, published_at, confirmed_at, status, api_response, is_simulated)
        values(variant.id, schedule.social_account_id, variant.platform, p_external_id, p_now, p_now,
            'PUBLISHED', '{"simulated":true,"externalRequestsSent":0}', true)
        on conflict (content_variant_id, social_account_id) do nothing;
    select * into result from public.published_content where content_variant_id = variant.id and social_account_id = schedule.social_account_id;
    update public.content_schedule set status = 'PUBLISHED', lease_expires_at = null where id = schedule.id;
    return to_jsonb(result);
end $$;

-- Privileged backend only. SECURITY INVOKER keeps table/RLS checks in force.
revoke all on function public.content_reserve_ai_request(text,text,integer) from public, anon, authenticated;
revoke all on function public.content_queue_dry_run(uuid,uuid,public.social_platform,timestamptz,text,text,text,text[],uuid[],text,text,integer,timestamptz,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.content_claim_dry_run(timestamptz) from public, anon, authenticated;
revoke all on function public.content_finish_dry_run(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.content_reserve_ai_request(text,text,integer) to service_role;
grant execute on function public.content_queue_dry_run(uuid,uuid,public.social_platform,timestamptz,text,text,text,text[],uuid[],text,text,integer,timestamptz,timestamptz,integer) to service_role;
grant execute on function public.content_claim_dry_run(timestamptz) to service_role;
grant execute on function public.content_finish_dry_run(uuid,text,timestamptz) to service_role;
commit;
