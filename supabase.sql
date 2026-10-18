-- ============================================================================
-- C'Lovefluence : base de données (même projet Supabase que StevenDex, tables cm_*)
-- À coller dans Supabase → SQL Editor → Run. Relançable sans risque.
-- Site de rencontre réservé aux 18 ans et plus : un mineur ne voit aucun profil et n'apparaît chez personne.
-- La date de naissance et le pseudo en jeu restent privés ; le pseudo en jeu n'est donné qu'aux matchs.
-- ============================================================================

create table if not exists cm_profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text not null,
  bio text not null default '' check (length(bio) <= 300),
  fav int check (fav between 1 and 1025),
  team int[] not null default '{}' check (coalesce(array_length(team, 1), 0) <= 6),
  tags text[] not null default '{}' check (coalesce(array_length(tags, 1), 0) <= 6),
  server text not null default '' check (length(server) <= 40),
  photos text[] not null default '{}' check (coalesce(array_length(photos, 1), 0) <= 4),
  updated_at timestamptz not null default now()
);
create table if not exists cm_private (
  id uuid primary key references auth.users on delete cascade,
  birth date not null,
  mc text not null default '' check (mc ~ '^([A-Za-z0-9_]{3,16})?$')
);
create table if not exists cm_swipes (
  from_id uuid not null references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create table if not exists cm_reports (
  id bigserial primary key,
  from_id uuid not null references auth.users on delete cascade,
  to_id uuid not null references auth.users on delete cascade,
  reason text not null check (length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);

alter table cm_profiles enable row level security;
alter table cm_private enable row level security;
alter table cm_swipes enable row level security;
alter table cm_reports enable row level security;

-- Majeur : date de naissance déclarée et 18 ans révolus
create or replace function cm_adult(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cm_private where id = u and birth <= current_date - interval '18 years')
$$;

-- Date de naissance : 18 ans minimum, et on ne peut plus la changer ensuite
create or replace function cm_check_private() returns trigger language plpgsql as $$
begin
  if new.birth > current_date - interval '18 years' then raise exception 'C''Lovefluence est réservé aux 18 ans et plus.'; end if;
  if tg_op = 'UPDATE' and new.birth <> old.birth then raise exception 'La date de naissance ne peut plus être modifiée.'; end if;
  return new;
end $$;
drop trigger if exists cm_check_private on cm_private;
create trigger cm_check_private before insert or update on cm_private for each row execute function cm_check_private();

-- Match : les deux joueurs se sont aimés
create or replace function cm_is_match(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cm_swipes s1 join cm_swipes s2 on s2.from_id = s1.to_id and s2.to_id = s1.from_id
                 where s1.from_id = a and s1.to_id = b and s1.liked and s2.liked)
$$;

do $$ begin
  -- les profils ne sont visibles qu'entre majeurs
  drop policy if exists "lecture" on cm_profiles;  create policy "lecture" on cm_profiles for select to authenticated using (id = auth.uid() or (cm_adult(auth.uid()) and cm_adult(id)));
  drop policy if exists "ajout" on cm_profiles;    create policy "ajout" on cm_profiles for insert to authenticated with check (id = auth.uid());
  drop policy if exists "modif" on cm_profiles;    create policy "modif" on cm_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
  drop policy if exists "suppr" on cm_profiles;    create policy "suppr" on cm_profiles for delete to authenticated using (id = auth.uid());
  drop policy if exists "lecture" on cm_private;   create policy "lecture" on cm_private for select to authenticated using (id = auth.uid());
  drop policy if exists "ajout" on cm_private;     create policy "ajout" on cm_private for insert to authenticated with check (id = auth.uid());
  drop policy if exists "modif" on cm_private;     create policy "modif" on cm_private for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
  -- on ne voit que ses propres swipes : personne ne sait qui l'a refusé
  drop policy if exists "lecture" on cm_swipes;    create policy "lecture" on cm_swipes for select to authenticated using (from_id = auth.uid());
  drop policy if exists "ajout" on cm_swipes;      create policy "ajout" on cm_swipes for insert to authenticated with check (from_id = auth.uid());
  drop policy if exists "ajout" on cm_reports;     create policy "ajout" on cm_reports for insert to authenticated with check (from_id = auth.uid());
end $$;

-- Le pseudo vient du compte (le même que sur StevenDex), pas du formulaire
create or replace function cm_fix_pseudo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.pseudo := coalesce((select raw_user_meta_data ->> 'pseudo' from auth.users where id = new.id), new.pseudo);
  new.updated_at := now();
  -- seules les photos envoyées dans son propre dossier sont acceptées (pas d'images d'autres sites)
  new.photos := array(select u from unnest(new.photos) u where u like '%/storage/v1/object/public/cm-photos/' || new.id || '/%' limit 4);
  return new;
end $$;
drop trigger if exists cm_fix_pseudo on cm_profiles;
create trigger cm_fix_pseudo before insert or update on cm_profiles for each row execute function cm_fix_pseudo();

-- Pile à swiper : profils majeurs pas encore vus, avec au moins une photo ou une bio, mélangés ; l'âge seul est donné, pas la date
drop function if exists cm_deck();
create or replace function cm_deck() returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object('age', extract(year from age(v.birth))::int)
  from cm_profiles p join cm_private v on v.id = p.id
  where cm_adult(auth.uid()) and p.id <> auth.uid() and cm_adult(p.id)
    and not exists (select 1 from cm_swipes s where s.from_id = auth.uid() and s.to_id = p.id)
    and (coalesce(array_length(p.photos, 1), 0) > 0 or p.bio <> '')
  order by random() limit 30
$$;

-- Swipe : renvoie true si ça fait un match
create or replace function cm_swipe(p_to uuid, p_like boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not cm_adult(auth.uid()) then raise exception 'Complète ton profil (date de naissance) pour swiper.'; end if;
  if not cm_adult(p_to) then raise exception 'Profil indisponible.'; end if;
  insert into cm_swipes (from_id, to_id, liked) values (auth.uid(), p_to, p_like) on conflict do nothing;
  return p_like and cm_is_match(auth.uid(), p_to);
end $$;

-- Mes matchs avec leur pseudo en jeu
drop function if exists cm_matches();
create or replace function cm_matches() returns table (id uuid, pseudo text, fav int, photos text[], server text, mc text, age int, at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.pseudo, p.fav, p.photos, p.server, c.mc, extract(year from age(c.birth))::int, greatest(s1.created_at, s2.created_at)
  from cm_swipes s1 join cm_swipes s2 on s2.from_id = s1.to_id and s2.to_id = s1.from_id and s2.liked
  join cm_profiles p on p.id = s1.to_id join cm_private c on c.id = p.id
  where s1.from_id = auth.uid() and s1.liked and cm_adult(auth.uid()) and cm_adult(p.id)
  order by 8 desc
$$;

-- Défaire un match (ou rendre un profil à nouveau visible) : on retire son propre swipe
create or replace function cm_unmatch(p_id uuid) returns void language sql security definer set search_path = public as $$
  update cm_swipes set liked = false where from_id = auth.uid() and to_id = p_id
$$;

revoke execute on function cm_is_match, cm_adult, cm_deck, cm_swipe, cm_matches, cm_unmatch from public, anon;
grant execute on function cm_is_match, cm_adult, cm_deck, cm_swipe, cm_matches, cm_unmatch to authenticated;

-- ---------- Photos : dossier par joueur, 3 Mo max, lisibles par tous ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cm-photos', 'cm-photos', true, 3145728, '{image/jpeg,image/png,image/webp}')
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = '{image/jpeg,image/png,image/webp}';
do $$ begin
  drop policy if exists "cm photos ajout" on storage.objects;
  create policy "cm photos ajout" on storage.objects for insert to authenticated with check (bucket_id = 'cm-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "cm photos suppr" on storage.objects;
  create policy "cm photos suppr" on storage.objects for delete to authenticated using (bucket_id = 'cm-photos' and (storage.foldername(name))[1] = auth.uid()::text);
end $$;
