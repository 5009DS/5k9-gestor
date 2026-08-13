-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 GESTOR — schema do banco.
--
-- Rode UMA VEZ no SQL Editor de um projeto Supabase NOVO, separado do que
-- hospeda o 5K9 Forms. Depois crie os acessos em
-- Authentication → Users → Add user (um por pessoa do time).
--
-- ── Duas decisões que valem explicação ────────────────────────────────────
--
-- 1. DINHEIRO EM CENTAVOS (bigint), não numeric nem float.
--    Float perde precisão em soma (0.1 + 0.2 ≠ 0.3) e numeric obriga a
--    lembrar da escala em cada operação. Inteiro de centavos é exato, soma
--    sem surpresa, e a divisão por 100 acontece só na hora de mostrar.
--
-- 2. TUDO EXIGE SESSÃO. Diferente do Forms, aqui não existe leitura
--    pública: nenhuma tela deste sistema é vista por gente de fora. As
--    políticas abaixo recusam qualquer operação sem usuário autenticado.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Ids como TEXT, não uuid: os dados de exemplo usam ids legíveis fixos
-- ("ex-cli-1"), e o app sempre manda um id (gera uuid no cliente quando não
-- tem um fixo). O default aqui é cinto de segurança.

-- ── Clientes: de onde o dinheiro vem ─────────────────────────────────────
create table if not exists clientes (
    id         text primary key default gen_random_uuid()::text,
    nome       text not null,
    empresa    text,
    documento  text,
    contato    text,
    cor        text,
    nota       text,
    criado_em  timestamptz not null default now()
);

-- ── Integrantes: para quem o dinheiro vai ────────────────────────────────
create table if not exists integrantes (
    id         text primary key default gen_random_uuid()::text,
    nome       text not null,
    papel      text,
    email      text,
    chave_pix  text,
    cor        text,
    ativo      boolean not null default true,
    nota       text,
    criado_em  timestamptz not null default now()
);

-- ── Entradas: cada pagamento recebido ou previsto ────────────────────────
-- on delete set null: excluir um cliente NÃO pode apagar a receita dele. O
-- dinheiro entrou de verdade; a entrada passa a aparecer como "sem cliente",
-- que é feio e recuperável — o certo nessa ordem.
create table if not exists entradas (
    id             text primary key default gen_random_uuid()::text,
    cliente_id     text references clientes(id) on delete set null,
    projeto        text not null default 'Sem descrição',
    valor_centavos bigint not null default 0,
    data           date not null default current_date,
    status         text not null default 'recebido',   -- recebido | previsto
    metodo         text,
    nota           text,
    criado_em      timestamptz not null default now()
);

create index if not exists entradas_data_idx    on entradas(data desc);
create index if not exists entradas_cliente_idx on entradas(cliente_id);

-- ── Repasses: o que foi (ou será) pago ao time ───────────────────────────
-- Valor lançado à mão: o sistema não calcula divisão. Cada projeto tem um
-- acordo próprio, e quem decide é o time — aqui só fica registrado.
create table if not exists repasses (
    id             text primary key default gen_random_uuid()::text,
    integrante_id  text references integrantes(id) on delete set null,
    entrada_id     text references entradas(id)    on delete set null,
    valor_centavos bigint not null default 0,
    data           date not null default current_date,
    status         text not null default 'pago',       -- pago | previsto
    metodo         text,
    nota           text,
    criado_em      timestamptz not null default now()
);

create index if not exists repasses_data_idx       on repasses(data desc);
create index if not exists repasses_integrante_idx on repasses(integrante_id);
create index if not exists repasses_entrada_idx    on repasses(entrada_id);

-- ── Investimentos: custo fixo e compra pontual ───────────────────────────
-- `data` é a primeira cobrança (para recorrente, é dela que o ciclo conta).
-- `encerrado_em` guarda QUANDO um custo fixo parou, em vez de um booleano:
-- assim os meses passados continuam calculando certo depois do cancelamento.
create table if not exists investimentos (
    id             text primary key default gen_random_uuid()::text,
    descricao      text not null,
    categoria      text,
    fornecedor     text,
    valor_centavos bigint not null default 0,
    tipo           text not null default 'recorrente', -- recorrente | pontual
    ciclo          text,                               -- mensal | anual | null
    data           date not null default current_date,
    encerrado_em   date,
    nota           text,
    criado_em      timestamptz not null default now()
);

create index if not exists investimentos_data_idx on investimentos(data desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — dado financeiro não sai daqui sem sessão.
-- ═══════════════════════════════════════════════════════════════════════════
alter table clientes      enable row level security;
alter table integrantes   enable row level security;
alter table entradas      enable row level security;
alter table repasses      enable row level security;
alter table investimentos enable row level security;

create policy "clientes: somente autenticado" on clientes
    for all to authenticated using (true) with check (true);
create policy "integrantes: somente autenticado" on integrantes
    for all to authenticated using (true) with check (true);
create policy "entradas: somente autenticado" on entradas
    for all to authenticated using (true) with check (true);
create policy "repasses: somente autenticado" on repasses
    for all to authenticated using (true) with check (true);
create policy "investimentos: somente autenticado" on investimentos
    for all to authenticated using (true) with check (true);
