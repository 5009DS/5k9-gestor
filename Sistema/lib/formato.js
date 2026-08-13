/* ═══════════════════════════════════════════════════════════════════════════
   FORMATO — dinheiro, datas e rótulos.

   ── Por que CENTAVOS, e não reais ────────────────────────────────────────
   Todo valor circula no sistema como INTEIRO de centavos (`valor_centavos`).
   Em ponto flutuante, 0,1 + 0,2 dá 0,30000000000000004; some cem repasses e
   o total do painel passa a divergir da soma das linhas por alguns centavos
   — o tipo de erro que ninguém encontra e todo mundo desconfia. Com inteiro
   a soma é exata, e a divisão por 100 acontece só na hora de mostrar.

   Quem entra e sai daqui: `paraCentavos()` na leitura do campo, `moeda()`
   na escrita na tela. Fora isso, ninguém deveria dividir por 100 na mão.
   ═══════════════════════════════════════════════════════════════════════════ */

const BRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
});
const NUM = new Intl.NumberFormat('pt-BR');

/** 150000 → "R$ 1.500,00" */
export const moeda = (centavos) => BRL.format((Number(centavos) || 0) / 100);

/**
 * Versão curta para números grandes de card: "R$ 1,5 mil", "R$ 12,4 mil".
 * Abaixo de mil devolve o formato cheio — abreviar R$ 340 não economiza
 * nada e ainda perde precisão.
 */
export const moedaCurta = (centavos) => {
    const reais = (Number(centavos) || 0) / 100;
    const abs = Math.abs(reais);
    if (abs >= 1_000_000) return `R$ ${NUM.format(+(reais / 1_000_000).toFixed(1))} mi`;
    if (abs >= 1_000)     return `R$ ${NUM.format(+(reais / 1_000).toFixed(1))} mil`;
    return BRL.format(reais);
};

/**
 * Lê o que a pessoa digitou e devolve centavos.
 *
 * Aceita "1.500,00", "1500,00", "1500.00" e "1500". A regra do separador
 * decimal é posicional, não por caractere: o ÚLTIMO ponto ou vírgula que
 * tenha exatamente dois dígitos depois é o decimal; qualquer outro é
 * separador de milhar. Sem isso, "1.500" (mil e quinhentos, como se
 * escreve em português) viraria R$ 1,50.
 */
export const paraCentavos = (texto) => {
    if (typeof texto === 'number') return Math.round(texto * 100);
    const limpo = String(texto || '').replace(/[^\d,.-]/g, '').trim();
    if (!limpo) return 0;

    const negativo = limpo.startsWith('-');
    const corpo = limpo.replace(/-/g, '');
    const m = corpo.match(/[.,](\d{1,2})$/);

    let inteiros, decimais;
    if (m) {
        inteiros = corpo.slice(0, m.index).replace(/[.,]/g, '');
        decimais = m[1].padEnd(2, '0');
    } else {
        inteiros = corpo.replace(/[.,]/g, '');
        decimais = '00';
    }
    const total = Number(inteiros || '0') * 100 + Number(decimais);
    return negativo ? -total : total;
};

/** 150000 → "1.500,00" — o que vai DENTRO do campo de edição. */
export const paraCampo = (centavos) =>
    ((Number(centavos) || 0) / 100).toLocaleString('pt-BR',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const numero = (n) => NUM.format(Number(n) || 0);

/** Percentual inteiro, protegido contra divisão por zero. */
export const pct = (parte, todo) => (todo ? Math.round((parte / todo) * 100) : 0);

// ── Datas ───────────────────────────────────────────────────────────────
/* Todas as datas do sistema são strings 'AAAA-MM-DD', nunca Date.
   `new Date('2026-08-13')` é interpretado como UTC e, em fuso negativo,
   volta como 12/08 às 21h — um lançamento do dia 1º cairia no mês anterior
   e sumiria do fechamento. Comparar e fatiar texto não tem esse problema. */

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                      'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Hoje em 'AAAA-MM-DD', no fuso local. */
export const hoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** '2026-08-13' → '2026-08' */
export const chaveMes = (dataIso) => String(dataIso || '').slice(0, 7);

/** Mês corrente como '2026-08'. */
export const mesAtual = () => hoje().slice(0, 7);

/** '2026-08-13' → '13/08/2026' */
export const dataBR = (dataIso) => {
    const p = String(dataIso || '').slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
};

/** '2026-08' → 'ago/26' */
export const mesCurto = (chave) => {
    const [ano, mes] = String(chave || '').split('-');
    return mes ? `${MESES[Number(mes) - 1]}/${String(ano).slice(2)}` : '—';
};

/** '2026-08' → 'agosto de 2026' */
export const mesExtenso = (chave) => {
    const [ano, mes] = String(chave || '').split('-');
    const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                   'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return mes ? `${nomes[Number(mes) - 1]} de ${ano}` : '—';
};

/** Desloca uma chave de mês. somarMeses('2026-01', -1) → '2025-12' */
export const somarMeses = (chave, delta) => {
    const [ano, mes] = String(chave).split('-').map(Number);
    const d = new Date(ano, mes - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Diferença em dias entre hoje e uma data ISO. Negativo = já passou. */
export const diasAte = (dataIso) => {
    if (!dataIso) return null;
    const [a, m, d] = String(dataIso).slice(0, 10).split('-').map(Number);
    const alvo = new Date(a, m - 1, d);
    const agora = new Date();
    return Math.round((alvo - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86_400_000);
};

/** Escapa texto vindo do usuário antes de entrar em template de HTML. */
export const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
