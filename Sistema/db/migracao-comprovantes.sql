-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — registro de comprovantes enviados
--
-- Rode no SQL Editor do projeto Supabase do Gestor. Seguro de rodar duas
-- vezes; nada aqui apaga ou sobrescreve dado existente.
--
-- ── Por que esta tabela existe ────────────────────────────────────────────
-- O envio é disparado por um cron. Cron reexecuta: por tentativa após falha,
-- por disparo manual durante um teste, por dois deploys concorrentes. Sem
-- registro do que já saiu, a segunda execução manda o mesmo comprovante de
-- novo — e comprovante financeiro repetido não é ruído, é motivo de alguém
-- achar que recebeu duas vezes.
--
-- A defesa real é o UNIQUE lá embaixo, não a consulta que a função faz antes
-- de enviar. Consultar-e-depois-gravar tem uma janela entre os dois passos;
-- o índice único não tem. A função trata a violação como "já foi enviado".
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists comprovantes_enviados (
    id             text primary key default gen_random_uuid()::text,
    integrante_id  text references integrantes(id) on delete cascade,
    tipo           text not null,              -- semanal | mensal
    inicio         date not null,
    fim            date not null,
    email          text not null,              -- para onde foi, no momento do envio
    total_centavos bigint not null default 0,  -- líquido do período
    quantidade     int    not null default 0,  -- quantos repasses
    enviado_em     timestamptz not null default now(),

    -- A trava. Um comprovante por pessoa, por tipo, por período.
    constraint comprovantes_sem_repeticao unique (integrante_id, tipo, inicio, fim)
);

create index if not exists comprovantes_integrante_idx
    on comprovantes_enviados(integrante_id, enviado_em desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mesma regra do resto do sistema: nada sai sem sessão. A função de envio
-- usa a chave service_role, que passa por cima do RLS por natureza — por
-- isso ela NUNCA pode ir para o navegador (ver Sistema/api/comprovantes.js).
alter table comprovantes_enviados enable row level security;

create policy "comprovantes: leitura autenticada" on comprovantes_enviados
    for select to authenticated using (true);

comment on table comprovantes_enviados is
    'Histórico de comprovantes de repasse enviados por e-mail. Escrito pela '
    'função agendada; o UNIQUE (integrante_id, tipo, inicio, fim) é o que '
    'garante um envio só por período.';
