-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — retenção para o estúdio
--
-- Rode no SQL Editor do projeto Supabase do Gestor. Seguro de rodar duas
-- vezes; nada aqui apaga ou sobrescreve dado existente.
--
-- ── O que passa a existir ─────────────────────────────────────────────────
-- Parte do que é alocado a um integrante pode ficar com o estúdio. Exemplo:
-- R$ 2.000 alocados ao Time1, dos quais R$ 150 ficam para o estúdio — a
-- pessoa recebe R$ 1.850 e o estúdio guarda R$ 150.
--
-- ── Por que um campo, e não um lançamento separado ────────────────────────
-- A retenção sai DE DENTRO do repasse. Como lançamento próprio, ela seria
-- uma linha de saída no caixa — e não é: o dinheiro não deixa o estúdio,
-- muda de bolso. Contar como saída faria o mesmo real sair duas vezes.
-- Aqui ela é o que de fato é: uma fatia do repasse que não foi paga.
--
-- ── Consequência para quem lê os números ──────────────────────────────────
-- `valor_centavos` passa a ser o BRUTO (o que foi alocado à pessoa) e o que
-- efetivamente saiu do caixa é `valor_centavos - retido_centavos`. Linhas
-- antigas ficam com retido = 0, então bruto e líquido coincidem e nenhum
-- fechamento anterior muda de valor.
-- ═══════════════════════════════════════════════════════════════════════════

alter table repasses
    add column if not exists retido_centavos bigint not null default 0;

-- Trava de sanidade: reter mais do que o repasse inteiro não tem significado,
-- e um sinal trocado na digitação viraria caixa negativo silencioso.
alter table repasses
    drop constraint if exists repasses_retido_valido;
alter table repasses
    add constraint repasses_retido_valido
    check (retido_centavos >= 0 and retido_centavos <= valor_centavos);

comment on column repasses.valor_centavos is
    'BRUTO alocado ao integrante. O que sai do caixa é valor_centavos - '
    'retido_centavos — ver lib/calculo.js, liquidoDoRepasse().';

comment on column repasses.retido_centavos is
    'Fatia do repasse que fica com o estúdio, alimentando a reserva que '
    'financia investimentos. Transferência interna: não é saída de caixa.';
