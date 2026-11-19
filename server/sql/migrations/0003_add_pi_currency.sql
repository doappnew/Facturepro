alter table public.currencies drop constraint currencies_decimals_check;
alter table public.currencies add constraint currencies_decimals_check check (decimals in (0,2,3,7));
alter table public.currencies drop constraint currencies_code_check;
alter table public.currencies add constraint currencies_code_check check (code ~ '^[A-Z]{2,3}$');
insert into public.currencies (code, decimals, name, label) values ('PI', 7, 'Pi', 'Pi');
