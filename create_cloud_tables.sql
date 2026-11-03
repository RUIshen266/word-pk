-- =============================================================
-- 单词PK · 云端持久化建表脚本
-- 在 Supabase 控制台（SQL Editor）执行本文件一次即可。
-- 用途：用一张 kv 表存放全局共享、无需登录的数据（排行榜 + 词库）。
-- =============================================================

-- 1) 建表：key 为主键，value 用 jsonb 存储任意 JSON
create table if not exists public.kv (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now()
);

-- 2) 授权：游戏无登录系统，服务端以 anon 身份读写，故开放 anon 全部权限
grant select, insert, update, delete on public.kv to anon, authenticated;

-- 3) 行级安全（RLS）：开启后必须显式放行 anon 的全部操作
alter table public.kv enable row level security;
drop policy if exists kv_anon_all on public.kv;
create policy kv_anon_all on public.kv
  for all to anon
  using (true)
  with check (true);

-- 4) 可选：预置空排行榜（首次部署云端为空时，本地默认值也会被写入，此步可跳过）
-- insert into public.kv (key, value)
-- values ('leaderboard', '{}'::jsonb)
-- on conflict (key) do nothing;
