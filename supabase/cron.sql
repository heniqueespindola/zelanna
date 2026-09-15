-- Executar manualmente no SQL editor do Supabase Studio (não em CI/deploy automático).
-- Substituir <PROJECT_REF> e configurar o header Authorization via Supabase Vault
-- (Studio → Cron UI trata isto automaticamente ao criar o job pela interface).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'gmail-sync-hourly',
  '0 * * * *',  -- de hora a hora; ajustar depois de validar quota/custo real
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
