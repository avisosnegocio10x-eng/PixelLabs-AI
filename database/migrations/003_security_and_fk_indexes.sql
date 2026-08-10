begin;

-- Keep trigger execution on the caller's privileges and make object lookup
-- deterministic. This function does not need elevated access.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- OAuth material remains backend-only. An explicit deny policy documents the
-- intended access model in addition to the revoked Data API privileges.
revoke all on table public.social_account_tokens from anon, authenticated;

do $$ begin
    create policy social_account_tokens_no_direct_access
    on public.social_account_tokens
    for all
    to anon, authenticated
    using (false)
    with check (false);
exception when duplicate_object then null; end $$;

-- PostgreSQL does not create indexes for foreign keys automatically. These
-- indexes cover joins and cascading deletes reported by Supabase advisors.
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists brand_assets_media_asset_id_idx on public.brand_assets (media_asset_id);
create index if not exists catalog_references_product_id_idx on public.catalog_references (product_id);
create index if not exists clip_versions_cover_asset_id_idx on public.clip_versions (cover_asset_id);
create index if not exists clip_versions_media_asset_id_idx on public.clip_versions (media_asset_id);
create index if not exists clip_versions_subtitle_asset_id_idx on public.clip_versions (subtitle_asset_id);
create index if not exists content_attribution_campaign_id_idx on public.content_attribution (campaign_id);
create index if not exists content_attribution_product_id_idx on public.content_attribution (product_id);
create index if not exists content_attribution_published_content_id_idx on public.content_attribution (published_content_id);
create index if not exists content_corrections_review_id_idx on public.content_corrections (review_id);
create index if not exists content_ideas_campaign_id_idx on public.content_ideas (campaign_id);
create index if not exists content_ideas_product_id_idx on public.content_ideas (product_id);
create index if not exists content_ideas_trend_id_idx on public.content_ideas (trend_id);
create index if not exists content_items_approved_by_idx on public.content_items (approved_by);
create index if not exists content_items_campaign_id_idx on public.content_items (campaign_id);
create index if not exists content_items_idea_id_idx on public.content_items (idea_id);
create index if not exists content_items_trend_id_idx on public.content_items (trend_id);
create index if not exists content_reviews_content_variant_id_idx on public.content_reviews (content_variant_id);
create index if not exists content_schedule_campaign_id_idx on public.content_schedule (campaign_id);
create index if not exists content_settings_created_by_idx on public.content_settings (created_by);
create index if not exists content_variants_content_item_id_idx on public.content_variants (content_item_id);
create index if not exists crm_contacts_first_product_id_idx on public.crm_contacts (first_product_id);
create index if not exists crm_contacts_first_published_content_id_idx on public.crm_contacts (first_published_content_id);
create index if not exists crm_opportunities_attribution_id_idx on public.crm_opportunities (attribution_id);
create index if not exists crm_opportunities_contact_id_idx on public.crm_opportunities (contact_id);
create index if not exists crm_opportunities_conversation_id_idx on public.crm_opportunities (conversation_id);
create index if not exists crm_opportunities_product_id_idx on public.crm_opportunities (product_id);
create index if not exists detected_moments_product_id_idx on public.detected_moments (product_id);
create index if not exists detected_moments_video_segment_id_idx on public.detected_moments (video_segment_id);
create index if not exists product_media_media_asset_id_idx on public.product_media (media_asset_id);
create index if not exists publication_attempts_content_schedule_id_idx on public.publication_attempts (content_schedule_id);
create index if not exists publication_attempts_content_variant_id_idx on public.publication_attempts (content_variant_id);
create index if not exists publication_attempts_social_account_id_idx on public.publication_attempts (social_account_id);
create index if not exists published_content_social_account_id_idx on public.published_content (social_account_id);
create index if not exists source_videos_media_asset_id_idx on public.source_videos (media_asset_id);
create index if not exists trends_source_id_idx on public.trends (source_id);
create index if not exists video_clips_detected_moment_id_idx on public.video_clips (detected_moment_id);
create index if not exists video_clips_product_id_idx on public.video_clips (product_id);
create index if not exists video_transcripts_source_video_id_idx on public.video_transcripts (source_video_id);
create index if not exists video_transcripts_video_segment_id_idx on public.video_transcripts (video_segment_id);

commit;
