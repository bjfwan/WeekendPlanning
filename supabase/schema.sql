-- ============================================================
-- AI 周末规划师 - Supabase Schema
-- ============================================================
-- 部署前需在 Supabase Dashboard 完成以下操作：
--   1. Authentication > Providers > Anonymous：开启匿名登录
--      （前端通过匿名登录获取 auth.uid，用于行程归属与协同偏好）
--   2. Realtime：确认已启用（Dashboard > Realtime > Settings）
--      本文件会把 plan_preferences 表加入 supabase_realtime publication
--   3. 后端服务使用 service_role 密钥访问数据库，可绕过 RLS；
--      下方 RLS 策略保持宽松，主要面向前端 anon/authenticated 客户端
-- 执行方式：将本文件内容粘贴到 Supabase SQL Editor 运行即可
-- ============================================================

-- ---------- plans 表（对应 PlanRecord）----------
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  title       text not null default '',
  city        text not null default '',
  date        text not null default '',
  duration    text not null default '1-day'
                check (duration in ('half-day', '1-day', '2-day', '3-day')),
  budget      numeric not null default 0,
  people      integer not null default 0,
  preferences text[] not null default '{}',
  transport   text not null default 'public'
                check (transport in ('public', 'driving', 'walking', 'mixed')),
  plan_data   jsonb not null default '{}'::jsonb,
  share_code  text unique,
  status      text not null default 'active'
                check (status in ('draft', 'active', 'completed')),
  -- 以下两个为向后兼容旧数据的可选字段，前端不再写入
  mood        text[],
  interests   text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- plan_preferences 表（对应 PlanPreferenceRecord）----------
create table if not exists public.plan_preferences (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.plans(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  nickname    text not null,
  preferences text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------- 索引 ----------
-- 分享码查询（unique 约束已自带索引，这里显式声明便于阅读）
create unique index if not exists plans_share_code_idx on public.plans(share_code);
-- 用户历史行程查询
create index if not exists plans_user_id_idx on public.plans(user_id);
-- 历史行程按创建时间倒序
create index if not exists plans_created_at_desc_idx on public.plans(created_at desc);
-- 行程协同成员查询
create index if not exists plan_preferences_plan_id_idx on public.plan_preferences(plan_id);

-- ---------- RLS：plans ----------
alter table public.plans enable row level security;

-- 分享链接需匿名访问 → 允许 anon/authenticated 读取
create policy "plans_select_anyone"
  on public.plans for select
  to anon, authenticated
  using (true);

-- 用户可写入自己的行程（前端直连场景；后端走 service_role 绕过 RLS）
create policy "plans_insert_owner"
  on public.plans for insert
  to anon, authenticated
  with check (user_id = auth.uid());

create policy "plans_update_owner"
  on public.plans for update
  to anon, authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "plans_delete_owner"
  on public.plans for delete
  to anon, authenticated
  using (user_id = auth.uid());

-- ---------- RLS：plan_preferences ----------
alter table public.plan_preferences enable row level security;

-- 成员列表需匿名展示 → 允许 anon/authenticated 读取
create policy "plan_preferences_select_anyone"
  on public.plan_preferences for select
  to anon, authenticated
  using (true);

-- 匿名用户可加入行程 → 允许 anon/authenticated 插入协同偏好
create policy "plan_preferences_insert_anyone"
  on public.plan_preferences for insert
  to anon, authenticated
  with check (true);

-- ---------- Realtime ----------
-- 将 plan_preferences 加入 realtime publication，供前端订阅成员加入事件
alter publication supabase_realtime add table public.plan_preferences;
