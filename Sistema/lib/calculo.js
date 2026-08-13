/* ═══════════════════════════════════════════════════════════════════════════
   CÁLCULO — o motor do fluxo de caixa.

   Toda agregação que o painel e as listas mostram nasce aqui. As páginas
   desenham; este arquivo decide o que os números significam. Manter assim
   é o que permite conferir uma conta sem abrir o CSS de ninguém.

   Três convenções valem para o arquivo inteiro:

     · Valores são inteiros de centavos (ver lib/formato.js).
     · Datas são strings 'AAAA-MM-DD'; mês é 'AAAA-MM'. Comparação é de
       texto, o que funciona porque o formato é ordenável por natureza.
     · REGIME DE CAIXA, não de competência: um lançamento entra no mês em
       que o dinheiro se move. Entrada prevista e repasse previsto ficam de
       fora dos totais realizados e aparecem em linha própria — misturar os
       dois é como um fluxo de caixa começa a mentir.
   ═══════════════════════════════════════════════════════════════════════════ */

import { chaveMes, somarMeses, hoje } from './formato.js';

const soma = (lista, campo = 'valor_centavos') =>
    lista.reduce((t, x) => t + (Number(x[campo]) || 0), 0);

// ── Entradas ────────────────────────────────────────────────────────────
export const entradasDoMes = (entradas, mes) =>
    entradas.filter(e => chaveMes(e.data) === mes);

export const recebidoNoMes = (entradas, mes) =>
    soma(entradasDoMes(entradas, mes).filter(e => e.status === 'recebido'));

export const previstoNoMes = (entradas, mes) =>
    soma(entradasDoMes(entradas, mes).filter(e => e.status !== 'recebido'));

// ── Repasses ────────────────────────────────────────────────────────────
export const repassesDoMes = (repasses, mes) =>
    repasses.filter(r => chaveMes(r.data) === mes);

export const repassadoNoMes = (repasses, mes) =>
    soma(repassesDoMes(repasses, mes).filter(r => r.status === 'pago'));

export const aPagarNoMes = (repasses, mes) =>
    soma(repassesDoMes(repasses, mes).filter(r => r.status !== 'pago'));

/* ── Investimentos: quando cada um pesa no caixa ──────────────────────────
   Um lançamento pontual pesa uma vez, no mês da compra. Um custo fixo pesa
   de novo a cada ciclo — e é aí que a conta costuma sair errada.

   A tentação é somar todos os recorrentes ativos em todo mês, mas isso
   inventa despesa: uma assinatura ANUAL de R$ 1.200 debitada em março não
   sai R$ 1.200 por mês, nem R$ 100 por mês — sai R$ 1.200 em março e zero
   nos outros onze. Em regime de caixa, o mês da cobrança é o que conta.

   Para planejamento existe `custoFixoMensalizado()`, que faz a média — mas
   ela é apresentada como referência, nunca somada ao caixa realizado. */
export const pesaNoMes = (inv, mes) => {
    const inicio = chaveMes(inv.data);
    if (!inicio || mes < inicio) return false;

    if (inv.tipo !== 'recorrente') return mes === inicio;

    // Encerrado: para de pesar a partir do mês SEGUINTE ao encerramento —
    // a cobrança daquele mês já tinha acontecido.
    if (inv.encerrado_em && mes > chaveMes(inv.encerrado_em)) return false;
    if (inv.ciclo === 'anual') return mes.slice(5) === inicio.slice(5);
    return true;   // mensal
};

export const investimentosDoMes = (investimentos, mes) =>
    investimentos.filter(i => pesaNoMes(i, mes));

export const investidoNoMes = (investimentos, mes) =>
    soma(investimentosDoMes(investimentos, mes));

/**
 * Custo fixo diluído por mês — só os recorrentes ativos. Anual dividido por
 * doze. Serve para responder "quanto o estúdio precisa faturar todo mês
 * para se manter de pé", que é outra pergunta, não o caixa do mês.
 */
export const custoFixoMensalizado = (investimentos) =>
    investimentos
        .filter(i => i.tipo === 'recorrente' && !i.encerrado_em)
        .reduce((t, i) => t + (i.ciclo === 'anual'
            ? Math.round((Number(i.valor_centavos) || 0) / 12)
            : (Number(i.valor_centavos) || 0)), 0);

/** Próxima data de cobrança de um custo fixo. Null se pontual ou encerrado. */
export const proximaRenovacao = (inv) => {
    if (inv.tipo !== 'recorrente' || inv.encerrado_em || !inv.data) return null;
    const [ano, mes, dia] = String(inv.data).slice(0, 10).split('-').map(Number);
    const agora = new Date();
    const hojeD = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    // Começa no primeiro vencimento e avança um ciclo por vez até passar de
    // hoje. Iterar é mais claro (e mais seguro com meses de 28/31 dias) do
    // que calcular o salto de uma vez.
    let d = new Date(ano, mes - 1, dia);
    const passo = inv.ciclo === 'anual' ? 12 : 1;
    let guarda = 0;
    while (d < hojeD && guarda++ < 600) d = new Date(d.getFullYear(), d.getMonth() + passo, dia);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Fechamento de um mês ────────────────────────────────────────────────
/**
 * O quadro completo de um mês. `saldo` é o que sobra para o estúdio depois
 * de pagar o time e as contas — receita realizada menos saídas realizadas.
 */
export const fluxoDoMes = ({ entradas, repasses, investimentos }, mes) => {
    const entrou     = recebidoNoMes(entradas, mes);
    const aReceber   = previstoNoMes(entradas, mes);
    const repassado  = repassadoNoMes(repasses, mes);
    const aRepassar  = aPagarNoMes(repasses, mes);
    const investido  = investidoNoMes(investimentos, mes);
    return {
        mes, entrou, aReceber, repassado, aRepassar, investido,
        saiu: repassado + investido,
        saldo: entrou - repassado - investido,
    };
};

/** Variação percentual contra o mês anterior. Sem base, 0% ou 100%. */
export const variacao = (atual, anterior) =>
    anterior === 0 ? (atual > 0 ? 100 : 0) : Math.round(((atual - anterior) / anterior) * 100);

// ── Série para o gráfico ────────────────────────────────────────────────
/**
 * Últimos `quantos` meses terminando no mês informado, cada um com entrada,
 * saída e saldo. Sempre devolve a janela cheia, inclusive meses zerados: um
 * gráfico que esconde o mês vazio faz o vale parecer que nunca existiu.
 */
export const serieMensal = (dados, mesFinal, quantos = 12) => {
    const meses = [];
    for (let i = quantos - 1; i >= 0; i--) meses.push(somarMeses(mesFinal, -i));
    return meses.map(m => fluxoDoMes(dados, m));
};

/** Primeiro mês com qualquer movimento — usado para não desenhar vazio. */
export const primeiroMesComDado = ({ entradas, repasses, investimentos }) => {
    const chaves = [...entradas, ...repasses, ...investimentos]
        .map(x => chaveMes(x.data)).filter(Boolean).sort();
    return chaves[0] || chaveMes(hoje());
};

// ── Recortes por pessoa e por cliente ───────────────────────────────────
/**
 * Quanto cada cliente já pagou. `mes` nulo = todos os tempos.
 * Ordenado do maior para o menor, que é como a lista sempre é lida.
 */
export const porCliente = (entradas, clientes, mes = null) => {
    const alvo = (mes ? entradasDoMes(entradas, mes) : entradas)
        .filter(e => e.status === 'recebido');
    const mapa = new Map();
    alvo.forEach(e => {
        const chave = e.cliente_id || 'sem-cliente';
        const atual = mapa.get(chave) || { total: 0, quantidade: 0 };
        mapa.set(chave, { total: atual.total + (Number(e.valor_centavos) || 0),
                          quantidade: atual.quantidade + 1 });
    });
    return [...mapa.entries()]
        .map(([id, v]) => ({
            cliente: clientes.find(c => c.id === id) || { id, nome: 'Sem cliente' },
            ...v,
        }))
        .sort((a, b) => b.total - a.total);
};

/** Quanto cada integrante recebeu (pago) e quanto ainda está previsto. */
export const porIntegrante = (repasses, integrantes, mes = null) => {
    const alvo = mes ? repassesDoMes(repasses, mes) : repasses;
    const mapa = new Map();
    alvo.forEach(r => {
        const chave = r.integrante_id || 'sem-integrante';
        const atual = mapa.get(chave) || { pago: 0, previsto: 0, quantidade: 0 };
        const v = Number(r.valor_centavos) || 0;
        mapa.set(chave, {
            pago:     atual.pago + (r.status === 'pago' ? v : 0),
            previsto: atual.previsto + (r.status !== 'pago' ? v : 0),
            quantidade: atual.quantidade + 1,
        });
    });
    return [...mapa.entries()]
        .map(([id, v]) => ({
            integrante: integrantes.find(i => i.id === id) || { id, nome: 'Sem integrante' },
            ...v,
        }))
        .sort((a, b) => (b.pago + b.previsto) - (a.pago + a.previsto));
};

/**
 * Quanto de uma entrada já foi repassado. É o que responde "esse projeto
 * já foi dividido?" sem precisar abrir a lista de repasses.
 */
export const repassadoDaEntrada = (repasses, entradaId) =>
    soma(repasses.filter(r => r.entrada_id === entradaId && r.status === 'pago'));

/** Entradas recebidas que ainda não têm repasse nenhum vinculado. */
export const entradasSemRepasse = (entradas, repasses) =>
    entradas.filter(e => e.status === 'recebido'
        && !repasses.some(r => r.entrada_id === e.id));
