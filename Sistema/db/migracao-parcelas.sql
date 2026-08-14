-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO — compras parceladas
--
-- Rode no SQL Editor do projeto Supabase do Gestor. Seguro de rodar duas
-- vezes: nada aqui apaga ou sobrescreve dado existente.
--
-- Por que uma coluna nova em vez de reaproveitar `ciclo`: parcelamento não é
-- um ciclo. Assinatura mensal cobra para sempre e o que importa é quando
-- renova; parcelamento cobra N vezes e acaba. Amontoar os dois no mesmo
-- campo obrigaria todo cálculo a adivinhar qual dos dois está lendo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table investimentos
    add column if not exists parcelas int;

-- `tipo` agora aceita três valores: 'recorrente', 'pontual' e 'parcelado'.
-- Não há CHECK na coluna (nunca houve), então nada a alterar aqui — mas fica
-- o registro de que 'parcelado' passou a ser válido a partir desta migração.

comment on column investimentos.parcelas is
    'Número de parcelas quando tipo = ''parcelado''. Nulo nos demais tipos. '
    'O valor de cada parcela NÃO é gravado: sai de valor_centavos / parcelas, '
    'com a sobra da divisão na última — ver lib/calculo.js, parcelaDe().';

comment on column investimentos.valor_centavos is
    'Para tipo = ''parcelado'', é o TOTAL a pagar (soma das parcelas, já com '
    'juros se houver), não o preço à vista.';
