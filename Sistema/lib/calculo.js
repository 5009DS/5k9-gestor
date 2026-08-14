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

    if (inv.tipo === 'parcelado') {
        const i = indiceDaParcela(inv, mes);
        return i >= 0 && i < totalDeParcelas(inv);
    }
    if (inv.tipo !== 'recorrente') return mes === inicio;

    // Encerrado: para de pesar a partir do mês SEGUINTE ao encerramento —
    // a cobrança daquele mês já tinha acontecido.
    if (inv.encerrado_em && mes > chaveMes(inv.encerrado_em)) return false;
    if (inv.ciclo === 'anual') return mes.slice(5) === inicio.slice(5);
    return true;   // mensal
};

/* ── Parcelamento ─────────────────────────────────────────────────────────
   Uma compra em 6x não sai do caixa de uma vez: saem seis parcelas, uma por
   mês. Tratá-la como compra pontual jogaria o valor inteiro num mês só e
   faria aquele mês parecer um desastre — e os cinco seguintes, um alívio
   que não existiu.

   O que fica gravado é o TOTAL e o NÚMERO de vezes; a parcela é derivada.
   Guardar os três seria guardar a mesma informação duas vezes, e informação
   duplicada diverge: bastaria alguém corrigir o total e esquecer a parcela
   para o sistema passar a somar um valor que nunca foi cobrado.           */

export const totalDeParcelas = (inv) => Math.max(1, Number(inv.parcelas) || 1);

/** Quantos meses se passaram do início até `mes`. Negativo = ainda não começou. */
export const indiceDaParcela = (inv, mes) => {
    const [a1, m1] = chaveMes(inv.data).split('-').map(Number);
    const [a2, m2] = String(mes).split('-').map(Number);
    return (a2 - a1) * 12 + (m2 - m1);
};

/**
 * Valor da parcela de índice `i` (base zero).
 *
 * A sobra da divisão vai toda na ÚLTIMA. R$ 1.000 em 3x são duas de 333,33 e
 * uma de 333,34 — e não três de 333,33, que somariam 999,99 e deixariam um
 * centavo órfão entre o total gravado e a soma do que o painel mostra.
 */
export const parcelaDe = (inv, i) => {
    const n = totalDeParcelas(inv);
    const total = Number(inv.valor_centavos) || 0;
    const base = Math.floor(total / n);
    return i === n - 1 ? total - base * (n - 1) : base;
};

/**
 * Quanto ESTE investimento tira do caixa no mês informado.
 *
 * Existe porque, para o parcelado, o que pesa não é `valor_centavos` — é uma
 * fração dele. Toda soma de investimento passa por aqui; ler o campo direto
 * é o erro que faz o total do mês estourar seis vezes.
 */
export const valorNoMes = (inv, mes) => {
    if (!pesaNoMes(inv, mes)) return 0;
    if (inv.tipo !== 'parcelado') return Number(inv.valor_centavos) || 0;
    return parcelaDe(inv, indiceDaParcela(inv, mes));
};

/** Investimentos que pesam no mês, cada um com o valor que pesa. */
export const investimentosDoMes = (investimentos, mes) =>
    investimentos
        .filter(i => pesaNoMes(i, mes))
        .map(i => ({ ...i, valor_no_mes: valorNoMes(i, mes),
                     parcela: i.tipo === 'parcelado' ? indiceDaParcela(i, mes) + 1 : null }));

export const investidoNoMes = (investimentos, mes) =>
    investimentos.reduce((t, i) => t + valorNoMes(i, mes), 0);

/**
 * O que ainda falta pagar de compras parceladas, contando a partir do mês
 * SEGUINTE ao informado. Responde "quanto já está comprometido" — dívida
 * assumida que ainda não apareceu em nenhum fechamento.
 */
export const parcelasEmAberto = (investimentos, mes) =>
    investimentos
        .filter(i => i.tipo === 'parcelado')
        .reduce((t, i) => {
            const n = totalDeParcelas(i);
            const jaPassaram = indiceDaParcela(i, mes) + 1;   // inclui a do próprio mês
            let resto = 0;
            for (let k = Math.max(0, jaPassaram); k < n; k++) resto += parcelaDe(i, k);
            return t + resto;
        }, 0);

/**
 * Custo fixo diluído por mês — só os recorrentes ativos. Anual dividido por
 * doze. Serve para responder "quanto o estúdio precisa faturar todo mês
 * para se manter de pé", que é outra pergunta, não o caixa do mês.
 *
 * Parcelamento fica de FORA de propósito: ele acaba. Somar as parcelas aqui
 * inflaria o piso do estúdio com uma despesa que some em três meses, e é
 * justamente esse número que se usa para decidir preço e pró-labore. Para
 * "quanto ainda devo", ver parcelasEmAberto().
 */
export const custoFixoMensalizado = (investimentos) =>
    investimentos
        .filter(i => i.tipo === 'recorrente' && !i.encerrado_em)
        .reduce((t, i) => t + (i.ciclo === 'anual'
            ? Math.round((Number(i.valor_centavos) || 0) / 12)
            : (Number(i.valor_centavos) || 0)), 0);

/**
 * Próxima data de cobrança. Serve tanto para custo fixo quanto para a
 * próxima parcela; devolve null para compra pontual, custo encerrado ou
 * parcelamento já quitado.
 */
export const proximaRenovacao = (inv) => {
    if (!inv.data) return null;
    if (inv.tipo === 'pontual') return null;
    if (inv.tipo === 'recorrente' && inv.encerrado_em) return null;

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

    // Parcelamento acabado não tem "próxima": a data calculada acima cairia
    // depois da última parcela e o painel anunciaria uma cobrança fantasma.
    if (inv.tipo === 'parcelado') {
        const i = indiceDaParcela(inv, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        if (i >= totalDeParcelas(inv)) return null;
    }
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
