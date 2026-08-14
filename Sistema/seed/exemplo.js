import { store } from '../store.js';
import { somarMeses, mesAtual } from '../lib/formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   DADOS DE EXEMPLO

   Existem para responder à pergunta que todo sistema financeiro vazio faz
   ao ser aberto: "isso aqui funciona?". Um painel de zeros não mostra o
   gráfico, não mostra a divisão do real, não mostra renovação vencendo.

   Tudo é FICTÍCIO e datado a partir do mês corrente, para o gráfico dos
   doze meses ter o que desenhar em qualquer época do ano. Nunca é chamado
   sozinho — só pelo botão em Configurações.
   ═══════════════════════════════════════════════════════════════════════════ */

const dia = (mesesAtras, diaDoMes) =>
    `${somarMeses(mesAtual(), -mesesAtras)}-${String(diaDoMes).padStart(2, '0')}`;

const CLIENTES = [
    { id: 'ex-cli-1', nome: 'Acme Bebidas',    empresa: 'Acme Bebidas LTDA',  contato: 'financeiro@acme.com', cor: '#A855FF' },
    { id: 'ex-cli-2', nome: 'Norte Imóveis',   empresa: 'Norte Participações', contato: 'contato@norte.com.br', cor: '#FF7A45' },
    { id: 'ex-cli-3', nome: 'Clínica Vértice', empresa: 'Vértice Saúde ME',    contato: 'adm@vertice.com',      cor: '#4FD1FF' },
    { id: 'ex-cli-4', nome: 'Festival Corrente', empresa: '',                  contato: 'producao@corrente.art', cor: '#FFC96B' },
];

const INTEGRANTES = [
    { id: 'ex-int-1', nome: 'Andrew Lucena',  papel: 'Direção criativa', cor: '#A855FF', ativo: true },
    { id: 'ex-int-2', nome: 'Fernanda Reis',  papel: 'Design',           cor: '#FF7A45', ativo: true },
    { id: 'ex-int-3', nome: 'Daniel Prado',   papel: 'Motion',           cor: '#4FD1FF', ativo: true },
    { id: 'ex-int-4', nome: 'Marina Bastos',  papel: 'Redação',          cor: '#3DDC97', ativo: true },
];

/* Valores em centavos. A curva sobe ao longo dos meses de propósito: um
   gráfico com todas as barras iguais não mostra que o gráfico funciona. */
const ENTRADAS = [
    ['ex-cli-1', 'Identidade visual — fase 1',      1_200_000, 5, 5, 'recebido', 'pix'],
    ['ex-cli-2', 'Campanha de lançamento',            850_000, 5, 18, 'recebido', 'ted'],
    ['ex-cli-1', 'Identidade visual — fase 2',      1_600_000, 4, 8, 'recebido', 'pix'],
    ['ex-cli-3', 'Site institucional',              2_400_000, 4, 22, 'recebido', 'boleto'],
    ['ex-cli-2', 'Social — mensalidade',              600_000, 3, 10, 'recebido', 'pix'],
    ['ex-cli-4', 'Direção de arte do festival',     3_100_000, 3, 27, 'recebido', 'ted'],
    ['ex-cli-2', 'Social — mensalidade',              600_000, 2, 10, 'recebido', 'pix'],
    ['ex-cli-3', 'Manutenção do site',                450_000, 2, 15, 'recebido', 'pix'],
    ['ex-cli-1', 'Manual de marca',                 1_900_000, 1, 6, 'recebido', 'ted'],
    ['ex-cli-2', 'Social — mensalidade',              600_000, 1, 10, 'recebido', 'pix'],
    ['ex-cli-4', 'Peças para redes — pacote',       1_150_000, 1, 24, 'recebido', 'pix'],
    ['ex-cli-2', 'Social — mensalidade',              600_000, 0, 10, 'recebido', 'pix'],
    ['ex-cli-3', 'Landing de campanha',               980_000, 0, 14, 'recebido', 'pix'],
    ['ex-cli-1', 'Consultoria — 2ª parcela',        1_400_000, 0, 28, 'previsto', 'ted'],
];

/* [integrante, bruto, meses atrás, dia, situação, retido para o estúdio]
   A retenção aparece em parte dos lançamentos, não em todos: é assim no uso
   real, e um exemplo em que TODO repasse retém ensinaria que o campo é
   obrigatório. */
const REPASSES = [
    ['ex-int-1', 500_000, 5, 8,  'pago',     30_000],
    ['ex-int-2', 380_000, 5, 8,  'pago',     20_000],
    ['ex-int-1', 620_000, 4, 12, 'pago',     40_000],
    ['ex-int-3', 420_000, 4, 12, 'pago',          0],
    ['ex-int-2', 540_000, 4, 12, 'pago',     30_000],
    ['ex-int-1', 900_000, 3, 6,  'pago',     60_000],
    ['ex-int-4', 350_000, 3, 6,  'pago',          0],
    ['ex-int-3', 610_000, 3, 6,  'pago',     35_000],
    ['ex-int-1', 700_000, 2, 9,  'pago',     45_000],
    ['ex-int-2', 430_000, 2, 9,  'pago',     25_000],
    ['ex-int-1', 880_000, 1, 7,  'pago',     55_000],
    ['ex-int-3', 520_000, 1, 7,  'pago',     30_000],
    ['ex-int-4', 300_000, 1, 7,  'pago',          0],
    ['ex-int-1', 640_000, 0, 12, 'pago',     40_000],
    ['ex-int-2', 470_000, 0, 12, 'pago',     30_000],
    ['ex-int-3', 380_000, 0, 20, 'previsto',      0],
];

/* [descrição, categoria, fornecedor, valor, tipo, ciclo, meses atrás, parcelas]
   O parcelado em andamento é proposital: sem ele, a coluna de compromissos e
   o indicador de parcelas em aberto nasceriam vazios e ninguém descobriria
   que existem. */
const INVESTIMENTOS = [
    ['Adobe Creative Cloud',  'Software',       'Adobe',      27_500,  'recorrente', 'mensal', 8,  null],
    ['Figma — 3 assentos',    'Software',       'Figma',      22_000,  'recorrente', 'mensal', 8,  null],
    ['Hospedagem e domínios', 'Infraestrutura', 'Vercel',      9_900,  'recorrente', 'mensal', 6,  null],
    ['Contabilidade',         'Serviços',       'Contec',     45_000,  'recorrente', 'mensal', 10, null],
    ['Seguro de equipamento', 'Serviços',       'Porto',     180_000,  'recorrente', 'anual',  4,  null],
    ['Monitor de referência', 'Equipamento',    'Dell',      420_000,  'parcelado',  null,     2,  6],
    ['Curso de tipografia',   'Educação',       'Type Camp', 189_000,  'parcelado',  null,     5,  3],
    ['Cadeira de trabalho',   'Equipamento',    'Herman',    320_000,  'pontual',    null,     1,  null],
];

export const semearExemplo = async () => {
    for (const c of CLIENTES)    await store.clientes.salvar(c);
    for (const i of INTEGRANTES) await store.integrantes.salvar(i);

    for (const [i, [cliente_id, projeto, valor, mesesAtras, d, status, metodo]] of ENTRADAS.entries()) {
        await store.entradas.salvar({
            id: `ex-ent-${i}`, cliente_id, projeto,
            valor_centavos: valor, data: dia(mesesAtras, d), status, metodo,
        });
    }

    for (const [i, [integrante_id, valor, mesesAtras, d, status, retido]] of REPASSES.entries()) {
        await store.repasses.salvar({
            id: `ex-rep-${i}`, integrante_id,
            valor_centavos: valor, retido_centavos: retido,
            data: dia(mesesAtras, d), status, metodo: 'pix',
        });
    }

    for (const [i, [descricao, categoria, fornecedor, valor, tipo, ciclo, mesesAtras, parcelas]]
         of INVESTIMENTOS.entries()) {
        await store.investimentos.salvar({
            id: `ex-inv-${i}`, descricao, categoria, fornecedor,
            valor_centavos: valor, tipo, ciclo, parcelas,
            data: dia(mesesAtras, 5), encerrado_em: null,
        });
    }

    store.limparCache();
};

/* Todo registro de exemplo carrega este prefixo no id. É o que permite
   removê-los sem tocar no que é real — e é também por isso que os ids são
   fixos em vez de uuid: semear duas vezes reescreve as mesmas linhas em vez
   de duplicar a base. */
const PREFIXO = 'ex-';

/* Ordem de exclusão: os dependentes primeiro. Repasse aponta para entrada, e
   entrada aponta para cliente; começar pelos cadastros faria o banco anular
   esses vínculos linha por linha à toa, logo antes de apagar as linhas. */
const ORDEM = ['repasses', 'entradas', 'investimentos', 'clientes', 'integrantes'];

/**
 * Remove SÓ os registros de exemplo, deixando os lançamentos reais.
 *
 * Existe porque "apagar tudo" é uma porta larga demais para quem só quer
 * limpar a demonstração depois de já ter começado a lançar de verdade.
 */
export const limparExemplo = async () => {
    for (const nome of ORDEM) {
        const linhas = await store[nome].listar();
        for (const l of linhas) {
            if (String(l.id).startsWith(PREFIXO)) await store[nome].excluir(l.id);
        }
    }
    store.limparCache();
};

/** Quantos registros de exemplo estão no banco agora. */
export const contarExemplo = async () => {
    let total = 0;
    for (const nome of ORDEM) {
        const linhas = await store[nome].listar();
        total += linhas.filter(l => String(l.id).startsWith(PREFIXO)).length;
    }
    return total;
};

/** Apaga tudo, em todas as coleções. Sem volta — ver Configurações. */
export const limparTudo = async () => {
    for (const nome of ORDEM) {
        const linhas = await store[nome].listar();
        for (const l of linhas) await store[nome].excluir(l.id);
    }
    store.limparCache();
};
