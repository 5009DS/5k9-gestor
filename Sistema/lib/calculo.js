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

/* ── Repasses e retenção ──────────────────────────────────────────────────
   Um repasse tem duas partes: a que vai para a pessoa e a que fica com o
   estúdio. R$ 2.000 alocados ao Time1 com R$ 150 retidos significam R$ 1.850
   saindo da conta e R$ 150 permanecendo em casa.

   A distinção não é cosmética. A retenção NÃO é saída de caixa — o dinheiro
   não deixa o estúdio, muda de bolso. Somá-la ao que foi repassado faria o
   mesmo real sair duas vezes: uma como pagamento ao time, outra depois como
   investimento pago com ele.

   Por isso `repassadoNoMes` devolve o LÍQUIDO. Quem quiser o bruto — quanto
   foi alocado à pessoa antes da retenção — usa `brutoNoMes`.            */

export const liquidoDoRepasse = (r) =>
    (Number(r.valor_centavos) || 0) - (Number(r.retido_centavos) || 0);

export const repassesDoMes = (repasses, mes) =>
    repasses.filter(r => chaveMes(r.data) === mes);

const pagos = (repasses, mes) =>
    repassesDoMes(repasses, mes).filter(r => r.status === 'pago');

/** O que efetivamente saiu para as pessoas. É isto que pesa no caixa. */
export const repassadoNoMes = (repasses, mes) =>
    pagos(repasses, mes).reduce((t, r) => t + liquidoDoRepasse(r), 0);

/** O que foi alocado antes da retenção — leitura de acordo, não de caixa. */
export const brutoNoMes = (repasses, mes) => soma(pagos(repasses, mes));

/** Quanto ficou com o estúdio no mês. */
export const retidoNoMes = (repasses, mes) =>
    soma(pagos(repasses, mes), 'retido_centavos');

export const aPagarNoMes = (repasses, mes) =>
    repassesDoMes(repasses, mes)
        .filter(r => r.status !== 'pago')
        .reduce((t, r) => t + liquidoDoRepasse(r), 0);

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
    const bruto      = brutoNoMes(repasses, mes);
    const retido     = retidoNoMes(repasses, mes);
    const aRepassar  = aPagarNoMes(repasses, mes);
    const investido  = investidoNoMes(investimentos, mes);
    return {
        mes, entrou, aReceber, repassado, bruto, retido, aRepassar, investido,
        // `retido` fica FORA de `saiu` e de `saldo` de propósito: ele já está
        // dentro do que não foi pago ao time. Somá-lo aqui seria descontar do
        // caixa um dinheiro que continua na conta.
        saiu: repassado + investido,
        saldo: entrou - repassado - investido,
    };
};

/* ── Reserva do estúdio ───────────────────────────────────────────────────
   O dinheiro retido dos repasses é o que banca os investimentos. A reserva
   responde: quanto já foi separado, quanto disso já virou compra, e o que
   sobra para comprar.

   Um esclarecimento que evita erro de leitura: a reserva NÃO é um segundo
   caixa somado ao saldo. Ela é uma etiqueta sobre parte do saldo que já
   existe — o retido nunca saiu da conta. Por isso ela pode ficar NEGATIVA,
   e isso é informação, não defeito: significa que os investimentos passaram
   do que foi separado e o excedente veio do lucro geral.               */

/** Tudo que foi retido até o fim do mês informado, inclusive. */
export const retidoAteMes = (repasses, mes) =>
    repasses
        .filter(r => r.status === 'pago' && chaveMes(r.data) <= mes)
        .reduce((t, r) => t + (Number(r.retido_centavos) || 0), 0);

/**
 * Tudo que os investimentos já consumiram até o mês informado.
 *
 * Percorre mês a mês em vez de somar `valor_centavos`: assinatura cobra
 * repetidamente e parcelamento cobra em pedaços, então o total consumido não
 * está em nenhum campo — ele é a soma do que pesou em cada mês.
 */
export const investidoAteMes = (investimentos, mes) => {
    if (!investimentos.length) return 0;
    const inicio = investimentos
        .map(i => chaveMes(i.data)).filter(Boolean).sort()[0];
    if (!inicio || inicio > mes) return 0;

    let total = 0;
    let m = inicio;
    // Guarda de 600 meses (50 anos): protege contra uma data absurda digitada
    // errada transformar isso num laço infinito.
    for (let n = 0; m <= mes && n < 600; n++) {
        total += investidoNoMes(investimentos, m);
        m = somarMeses(m, 1);
    }
    return total;
};

/** Retido acumulado menos investido acumulado. Negativo = gastou além. */
export const reservaDoEstudio = (repasses, investimentos, mes) => {
    const separado = retidoAteMes(repasses, mes);
    const gasto    = investidoAteMes(investimentos, mes);
    return { separado, gasto, disponivel: separado - gasto };
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

/**
 * Quanto cada integrante recebeu, quanto está previsto e quanto do ganho
 * dele ficou com o estúdio.
 *
 * `pago` é LÍQUIDO — o que a pessoa de fato recebeu. Mostrar o bruto aqui
 * faria a soma da coluna não bater com o que saiu da conta, e é essa soma
 * que alguém confere contra o extrato.
 */
export const porIntegrante = (repasses, integrantes, mes = null) => {
    const alvo = mes ? repassesDoMes(repasses, mes) : repasses;
    const mapa = new Map();
    alvo.forEach(r => {
        const chave = r.integrante_id || 'sem-integrante';
        const atual = mapa.get(chave) || { pago: 0, previsto: 0, retido: 0, bruto: 0, quantidade: 0 };
        const liquido = liquidoDoRepasse(r);
        const pago = r.status === 'pago';
        mapa.set(chave, {
            pago:     atual.pago + (pago ? liquido : 0),
            previsto: atual.previsto + (pago ? 0 : liquido),
            retido:   atual.retido + (pago ? (Number(r.retido_centavos) || 0) : 0),
            bruto:    atual.bruto + (pago ? (Number(r.valor_centavos) || 0) : 0),
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
 * Quanto de uma entrada já foi dividido. Usa o BRUTO — a pergunta aqui é
 * "esse projeto já foi rateado?", e a parte retida também saiu do bolo da
 * entrada, ainda que tenha ficado em casa.
 */
export const repassadoDaEntrada = (repasses, entradaId) =>
    soma(repasses.filter(r => r.entrada_id === entradaId && r.status === 'pago'));

/** Entradas recebidas que ainda não têm repasse nenhum vinculado. */
export const entradasSemRepasse = (entradas, repasses) =>
    entradas.filter(e => e.status === 'recebido'
        && !repasses.some(r => r.entrada_id === e.id));
