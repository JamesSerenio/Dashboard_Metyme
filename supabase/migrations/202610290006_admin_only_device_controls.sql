-- Login Activity & Devices is admin-only.
-- Run this after migrations 003, 004 and 005.

create or replace function public.check_live_dashboard_session() returns boolean
language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select public.is_live_auth_session()
$$;

create or replace function public.list_login_devices()
returns table(session_id uuid,device_key_hash text,account_email text,role text,browser text,os text,device_type text,login_at timestamptz,last_active timestamptz,is_current boolean,status text)
language sql security definer set search_path=pg_catalog,public,auth as $$
  select d.session_id,d.device_key_hash,u.email::text,lower(p.role::text),d.browser,d.os,d.device_type,d.login_at,d.last_active,d.session_id=public.current_session_id(),d.status
  from public.login_devices d
  join auth.users u on u.id=d.user_id
  join public.profiles p on p.id=d.user_id
  where public.is_live_auth_session() and public.is_dashboard_admin()
  order by d.last_active desc
$$;

create or replace function public.block_login_device(p_session_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare target_user uuid;target_hash text;
begin
  if not public.is_live_auth_session() or not public.is_dashboard_admin() then raise exception 'Admin only' using errcode='42501';end if;
  select user_id,device_key_hash into target_user,target_hash from public.login_devices where session_id=p_session_id;
  if target_user is null then raise exception 'Device not found';end if;
  update public.login_devices set status='blocked',blocked_at=now(),blocked_by=auth.uid() where user_id=target_user and device_key_hash=target_hash;
  delete from auth.sessions where id in(select session_id from public.login_devices where user_id=target_user and device_key_hash=target_hash);
end$$;

create or replace function public.unblock_login_device(p_session_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare target_user uuid;target_hash text;
begin
  if not public.is_live_auth_session() or not public.is_dashboard_admin() then raise exception 'Admin only' using errcode='42501';end if;
  select user_id,device_key_hash into target_user,target_hash from public.login_devices where session_id=p_session_id;
  if target_user is null then raise exception 'Device not found';end if;
  update public.login_devices set status='active',blocked_at=null,blocked_by=null where user_id=target_user and device_key_hash=target_hash;
end$$;

create or replace function public.logout_login_device(p_session_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
begin
  if not public.is_live_auth_session() or not public.is_dashboard_admin() then raise exception 'Admin only' using errcode='42501';end if;
  if not exists(select 1 from public.login_devices where session_id=p_session_id) then raise exception 'Device not found';end if;
  delete from auth.sessions where id=p_session_id;
  delete from public.login_devices where session_id=p_session_id;
end$$;

revoke all on function public.list_login_devices(),public.block_login_device(uuid),public.unblock_login_device(uuid),public.logout_login_device(uuid) from public,anon;
grant execute on function public.list_login_devices(),public.block_login_device(uuid),public.unblock_login_device(uuid),public.logout_login_device(uuid) to authenticated;
revoke all on function public.check_live_dashboard_session() from public,anon;
grant execute on function public.check_live_dashboard_session() to authenticated;
