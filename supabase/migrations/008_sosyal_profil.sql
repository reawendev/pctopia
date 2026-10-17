-- 008: Oyuncu paylaşımları, beğeniler ve yorumlar. 007'den SONRA bir kez çalıştır.

alter table public.social_posts add column if not exists kind text not null default 'npc';
alter table public.social_posts drop constraint if exists social_posts_kind_check;
alter table public.social_posts add constraint social_posts_kind_check check (kind in ('npc', 'player'));
create index if not exists social_posts_kind_idx on public.social_posts (kind, company_id, created_at desc);

create table if not exists public.post_likes (
  post_id bigint not null references public.social_posts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, company_id)
);
alter table public.post_likes enable row level security;

create table if not exists public.post_comments (
  id bigserial primary key,
  post_id bigint not null references public.social_posts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
