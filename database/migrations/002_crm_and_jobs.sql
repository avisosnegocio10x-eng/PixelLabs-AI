begin;

do $$ begin
    create type crm_platform as enum ('messenger', 'instagram', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
    create type crm_direction as enum ('INBOUND', 'OUTBOUND', 'SYSTEM');
exception when duplicate_object then null; end $$;

create table if not exists crm_contacts (
    id uuid primary key default gen_random_uuid(),
    platform crm_platform not null,
    external_id text not null,
    display_name text,
    ai_enabled boolean not null default true,
    email_sent boolean not null default false,
    status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'QUALIFIED', 'CUSTOMER', 'BLOCKED', 'ARCHIVED')),
    first_product_id uuid references products(id) on delete set null,
    first_published_content_id uuid references published_content(id) on delete set null,
    first_attribution_code text,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (platform, external_id)
);

create table if not exists crm_conversations (
    id uuid primary key default gen_random_uuid(),
    contact_id uuid not null references crm_contacts(id) on delete cascade,
    platform crm_platform not null,
    external_id text not null,
    status text not null default 'OPEN'
        check (status in ('OPEN', 'WAITING_CUSTOMER', 'WAITING_AGENT', 'CLOSED', 'ARCHIVED')),
    last_message_at timestamptz,
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (platform, external_id)
);

create table if not exists crm_messages (
    id bigint generated always as identity primary key,
    conversation_id uuid not null references crm_conversations(id) on delete cascade,
    direction crm_direction not null,
    role text not null check (role in ('user', 'assistant', 'system', 'agent')),
    external_message_id text,
    body text not null,
    attachments jsonb not null default '[]',
    occurred_at timestamptz not null default now(),
    metadata jsonb not null default '{}'
);

create unique index if not exists crm_messages_external_id_unique
    on crm_messages (conversation_id, external_message_id)
    where external_message_id is not null;

create table if not exists crm_opportunities (
    id uuid primary key default gen_random_uuid(),
    contact_id uuid not null references crm_contacts(id) on delete cascade,
    conversation_id uuid references crm_conversations(id) on delete set null,
    product_id uuid references products(id) on delete set null,
    attribution_id uuid references content_attribution(id) on delete set null,
    status text not null default 'NEW'
        check (status in ('NEW', 'QUALIFYING', 'READY_FOR_QUOTE', 'QUOTED', 'WON', 'LOST', 'ARCHIVED')),
    extracted_quote jsonb not null default '{}',
    estimated_value numeric(12,2) check (estimated_value is null or estimated_value >= 0),
    actual_value numeric(12,2) check (actual_value is null or actual_value >= 0),
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists workflow_jobs (
    id uuid primary key,
    workflow_type text not null,
    status text not null default 'QUEUED'
        check (status in ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    payload jsonb not null default '{}',
    result jsonb,
    idempotency_key text,
    attempt integer not null default 0 check (attempt >= 0),
    max_attempts integer not null default 3 check (max_attempts between 1 and 20),
    error_code text,
    error_message text,
    locked_by text,
    locked_at timestamptz,
    next_attempt_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    unique (workflow_type, idempotency_key)
);

create table if not exists social_account_tokens (
    social_account_id uuid primary key references social_accounts(id) on delete cascade,
    access_ciphertext text not null,
    access_iv text not null,
    access_tag text not null,
    refresh_ciphertext text,
    refresh_iv text,
    refresh_tag text,
    access_expires_at timestamptz,
    refresh_expires_at timestamptz,
    scopes text[] not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_status_idx
    on crm_contacts (status, updated_at desc);
create index if not exists crm_conversations_contact_idx
    on crm_conversations (contact_id, last_message_at desc);
create index if not exists crm_messages_timeline_idx
    on crm_messages (conversation_id, occurred_at desc);
create index if not exists crm_opportunities_pipeline_idx
    on crm_opportunities (status, updated_at desc);
create index if not exists workflow_jobs_queue_idx
    on workflow_jobs (status, next_attempt_at, created_at);

alter table social_account_tokens enable row level security;

do $$ begin
    create trigger social_account_tokens_set_updated_at
    before update on social_account_tokens
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$
begin
    insert into storage.buckets (
        id,
        name,
        public,
        allowed_mime_types
    ) values (
        'pixellabs-content',
        'pixellabs-content',
        false,
        array[
            'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
            'image/jpeg', 'image/png', 'image/webp',
            'audio/wav', 'audio/mpeg', 'text/vtt', 'application/sla'
        ]
    )
    on conflict (id) do update set
        public = false,
        allowed_mime_types = excluded.allowed_mime_types;
exception when undefined_table then
    raise notice 'Supabase Storage no está disponible; crea el bucket privado durante el despliegue.';
end $$;

update products
set price_confirmed_at = coalesce(price_confirmed_at, now())
where reference = 'LLV-024'
  and (metadata ->> 'source') = 'verified_business_context';

alter table detected_moments
    add column if not exists analysis_key text;

create unique index if not exists detected_moments_analysis_key_unique
    on detected_moments (source_video_id, analysis_key);

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'crm_contacts', 'crm_conversations', 'crm_messages',
        'crm_opportunities', 'workflow_jobs'
    ] loop
        execute format('alter table %I enable row level security', table_name);
        begin
            execute format(
                'create policy %I on %I for all to authenticated using (is_content_admin()) with check (is_content_admin())',
                table_name || '_admin_all',
                table_name
            );
        exception when duplicate_object then null;
        end;
    end loop;
end $$;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'crm_contacts', 'crm_conversations', 'crm_opportunities', 'workflow_jobs'
    ] loop
        begin
            execute format(
                'create trigger %I before update on %I for each row execute function set_updated_at()',
                table_name || '_set_updated_at',
                table_name
            );
        exception when duplicate_object then null;
        end;
    end loop;
end $$;

commit;
