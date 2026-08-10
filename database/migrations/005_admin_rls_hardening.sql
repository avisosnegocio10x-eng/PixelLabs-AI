begin;

create or replace function public.is_content_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'admin'),
        false
    );
$$;

revoke all on function public.is_content_admin() from public;
grant execute on function public.is_content_admin() to authenticated;

do $$
declare
    policy_record record;
begin
    for policy_record in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and policyname like '%_admin_all'
    loop
        execute format(
            'alter policy %I on %I.%I to authenticated using ((select public.is_content_admin())) with check ((select public.is_content_admin()))',
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename
        );
    end loop;
end $$;

commit;
