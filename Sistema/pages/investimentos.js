import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { marcarAtivo, trocarSuave } from '../lib/ui.js';
import {
    moeda, dataBR, hoje, mesAtual, mesExtenso, somarMeses, esc, diasAte,
} from '../lib/formato.js';
import {
    investimentosDoMes, investidoNoMes, custoFixoMensalizado, proximaRenovacao,
} from '../lib/calculo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   INVESTIMENTOS — o que o estúdio gasta consigo mesmo.

   Duas naturezas, e a diferença entre elas é o ponto da tela:

     · CUSTO FIXO (recorrente) — assinatura, ferramenta, licença. Volta a
       cobrar a cada ciclo. O que importa é quando vence de novo e quanto
       pesa por mês.
     · COMPRA PONTUAL — equipamento, curso, licença avulsa. Pesa uma vez, no
       mês em que aconteceu.

   Por isso a página tem duas listas em vez de uma só ordenada por data:
   misturar assinatura com compra de monitor faz o custo fixo desaparecer no
   meio do histórico, e é justamente ele que precisa ser vigiado.
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORIAS = ['Software', 'Equipamento', 'Educação', 'Marketing',
                    'Infraestrutura', 'Serviços', 'Outro'];

export const renderInvestimentos = async (container) => {
    let investimentos = await store.investimentos.listar();

    let mes = mesAtual();
    let filtro = 'todos';   // 'todos' | 'recorrente' | 'pontual'

    const { content } = renderShell(container, {
        path: '/investimentos',
        title: 'Investimentos',
        subtitle: 'Custos fixos e compras do estúdio.',
        actions: `<button class="ds-btn ds-btn--primary" id="iv-novo">
                      <i data-lucide="plus"></i> Novo investimento
                  </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    // ── Formulário ──────────────────────────────────────────────────────
    const CAMPOS = [
        { nome: 'descricao', rotulo: 'O que é', obrigatorio: true, placeholder: 'Adobe Creative Cloud' },
        { nome: 'valor_centavos', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true, largura: 'metade' },
        { nome: 'data', rotulo: 'Data da 1ª cobrança', tipo: 'data', obrigatorio: true, largura: 'metade',
          dica: 'Para custos fixos, é a partir dela que o ciclo conta.' },
        { nome: 'tipo', rotulo: 'Natureza', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'recorrente', rotulo: 'Custo fixo (recorrente)' },
                   { valor: 'pontual',    rotulo: 'Compra pontual' }] },
        { nome: 'ciclo', rotulo: 'Ciclo', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'mensal', rotulo: 'Mensal' }, { valor: 'anual', rotulo: 'Anual' }],
          dica: 'Ignorado nas compras pontuais.' },
        { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', largura: 'metade',
          opcoes: CATEGORIAS.map(c => ({ valor: c, rotulo: c })) },
        { nome: 'fornecedor', rotulo: 'Fornecedor', largura: 'metade', placeholder: 'Adobe' },
        { nome: 'ativo', rotulo: 'Ainda está ativo', tipo: 'checkbox',
          dica: 'Ao desmarcar, o custo para de pesar nos meses seguintes — o histórico anterior permanece.' },
        { nome: 'nota', rotulo: 'Observação', tipo: 'textarea' },
    ];

    const recarregar = async () => {
        store.limparCache();
        investimentos = await store.investimentos.listar();
        desenhar();
    };

    const abrir = (inv = null) => abrirFormulario({
        titulo: inv ? 'Editar investimento' : 'Novo investimento',
        subtitulo: inv ? esc(inv.descricao) : 'Custo fixo ou compra do estúdio',
        campos: CAMPOS,
        valores: inv
            ? { ...inv, ativo: !inv.encerrado_em }
            : { data: hoje(), tipo: 'recorrente', ciclo: 'mensal', categoria: 'Software', ativo: true },
        rotuloSalvar: inv ? 'Salvar' : 'Lançar',
        aoSalvar: async ({ ativo, ...dados }) => {
            /* O formulário pergunta "ainda está ativo?"; o banco guarda
               QUANDO parou. A tradução acontece aqui, e não no campo, porque
               a data de encerramento é o que permite recalcular meses
               passados sem apagá-los — um booleano sozinho reescreveria o
               histórico toda vez que alguém cancelasse uma assinatura. */
            dados.encerrado_em = ativo
                ? null
                : (inv?.encerrado_em || hoje());
            if (dados.tipo !== 'recorrente') dados.ciclo = null;
            await store.investimentos.salvar(dados);
            await recarregar();
            toast(inv ? 'Investimento atualizado.' : 'Investimento lançado.');
        },
        aoExcluir: inv ? async () => {
            await store.investimentos.excluir(inv.id);
            await recarregar();
            toast('Investimento excluído.');
        } : null,
    });

    document.getElementById('iv-novo').addEventListener('click', () => abrir());

    // ── Desenho ─────────────────────────────────────────────────────────
    const desenhar = () => {
        const fixos = investimentos
            .filter(i => i.tipo === 'recorrente')
            .filter(i => filtro === 'todos' || filtro === 'recorrente')
            .map(i => ({ ...i, quando: proximaRenovacao(i) }))
            .sort((a, b) => {
                // Ativos primeiro, e dentro deles o que vence antes.
                if (!!a.encerrado_em !== !!b.encerrado_em) return a.encerrado_em ? 1 : -1;
                return String(a.quando || '9999').localeCompare(String(b.quando || '9999'));
            });

        const doMes = investimentosDoMes(investimentos, mes)
            .filter(i => filtro === 'todos' || i.tipo === filtro)
            .sort((a, b) => String(b.data).localeCompare(String(a.data)));

        const totalMes = investidoNoMes(investimentos, mes);
        const fixoMensal = custoFixoMensalizado(investimentos);
        const ativos = investimentos.filter(i => i.tipo === 'recorrente' && !i.encerrado_em).length;

        content.innerHTML = `
            <section class="gs-kpis">
                <article class="ds-card gs-kpi gs-kpi--sai">
                    <div class="gs-kpi__topo">
                        <span class="gs-kpi__rotulo">Saiu em ${mesExtenso(mes)}</span>
                        <span class="gs-kpi__icone"><i data-lucide="receipt"></i></span>
                    </div>
                    <span class="gs-kpi__valor">${moeda(totalMes)}</span>
                    <span class="gs-kpi__pe"><span>${doMes.length} cobrança${doMes.length === 1 ? '' : 's'} no mês</span></span>
                </article>

                <article class="ds-card ds-card--lit gs-kpi gs-kpi--saldo">
                    <div class="gs-kpi__topo">
                        <span class="gs-kpi__rotulo">Custo fixo mensalizado</span>
                        <span class="gs-kpi__icone"><i data-lucide="repeat"></i></span>
                    </div>
                    <span class="gs-kpi__valor">${moeda(fixoMensal)}</span>
                    <span class="gs-kpi__pe"><span>${ativos} assinatura${ativos === 1 ? '' : 's'} ativa${ativos === 1 ? '' : 's'} · anuais divididos por 12</span></span>
                </article>

                <article class="ds-card gs-kpi">
                    <div class="gs-kpi__topo">
                        <span class="gs-kpi__rotulo">Custo fixo no ano</span>
                        <span class="gs-kpi__icone"><i data-lucide="calendar"></i></span>
                    </div>
                    <span class="gs-kpi__valor">${moeda(fixoMensal * 12)}</span>
                    <span class="gs-kpi__pe"><span>projeção, se nada mudar</span></span>
                </article>
            </section>

            <section class="ds-card gs-barra">
                <div class="gs-mes">
                    <button class="ds-icon-btn" id="iv-ant" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                    <span class="gs-mes__rotulo">${mesExtenso(mes)}</span>
                    <button class="ds-icon-btn" id="iv-prox" aria-label="Próximo mês"
                            ${mes >= mesAtual() ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
                </div>
                <span class="gs-barra__espaco"></span>
                <div class="gs-filtros" id="iv-filtro">
                    <button class="gs-filtro" data-filtro="todos"      aria-pressed="false">Todos</button>
                    <button class="gs-filtro" data-filtro="recorrente" aria-pressed="false">Custos fixos</button>
                    <button class="gs-filtro" data-filtro="pontual"    aria-pressed="false">Compras</button>
                </div>
            </section>

            <section class="iv-linha">
                <article class="ds-card gs-secao">
                    <div class="gs-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">Custos fixos</h2>
                            <span class="ds-card-sub">Ordenados pela próxima cobrança</span>
                        </div>
                    </div>
                    <div id="iv-fixos">${listaFixos(fixos)}</div>
                </article>

                <article class="ds-card gs-secao">
                    <div class="gs-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">Pesou em ${mesExtenso(mes)}</h2>
                            <span class="ds-card-sub">Tudo que foi cobrado neste mês</span>
                        </div>
                    </div>
                    <div id="iv-mes">${listaMes(doMes)}</div>
                </article>
            </section>
        `;

        marcarAtivo(document.getElementById('iv-filtro'), 'filtro', filtro);
        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    const ligarEventos = () => {
        document.getElementById('iv-filtro').addEventListener('click', (e) => {
            const b = e.target.closest('[data-filtro]');
            if (!b) return;
            filtro = b.dataset.filtro;
            trocarSuave(content, desenhar);
        });
        document.getElementById('iv-ant').addEventListener('click', () => { mes = somarMeses(mes, -1); desenhar(); });
        document.getElementById('iv-prox').addEventListener('click', () => {
            if (mes < mesAtual()) { mes = somarMeses(mes, 1); desenhar(); }
        });
        document.querySelectorAll('[data-id]').forEach(el => {
            el.addEventListener('click', () => abrir(investimentos.find(x => x.id === el.dataset.id)));
        });
    };

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────
const listaFixos = (fixos) => {
    if (!fixos.length) return vazio('repeat', 'Nenhum custo fixo cadastrado.');

    return `<div class="gs-lista">${fixos.map(i => {
        const encerrado = !!i.encerrado_em;
        const dias = i.quando ? diasAte(i.quando) : null;
        return `
        <button class="gs-linha ${encerrado ? 'iv-encerrado' : ''}" data-id="${esc(i.id)}">
            <span class="gs-linha__marca"><i data-lucide="${encerrado ? 'circle-slash' : 'repeat'}"></i></span>
            <div class="gs-linha__info">
                <p class="gs-linha__titulo">${esc(i.descricao)}</p>
                <p class="gs-linha__meta">
                    <span>${esc(i.fornecedor || i.categoria || 'Sem categoria')}</span>
                    <span>${i.ciclo === 'anual' ? 'anual' : 'mensal'}</span>
                    ${encerrado ? `<span>encerrado em ${dataBR(i.encerrado_em)}</span>` : ''}
                </p>
            </div>
            <span class="gs-linha__valor">${moeda(i.valor_centavos)}</span>
            <span class="gs-linha__lado">
                ${encerrado
                    ? `<span class="ds-chip">inativo</span>`
                    : `<span class="ds-chip ${dias !== null && dias <= 7 ? 'ds-chip--warning' : ''}">
                           ${dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `em ${dias} dias`}
                       </span>`}
            </span>
        </button>`;
    }).join('')}</div>`;
};

const listaMes = (doMes) => {
    if (!doMes.length) return vazio('receipt', 'Nenhuma cobrança neste mês.');

    return `<div class="gs-lista">${doMes.map(i => `
        <button class="gs-linha" data-id="${esc(i.id)}">
            <span class="gs-linha__marca"><i data-lucide="${i.tipo === 'recorrente' ? 'repeat' : 'shopping-bag'}"></i></span>
            <div class="gs-linha__info">
                <p class="gs-linha__titulo">${esc(i.descricao)}</p>
                <p class="gs-linha__meta">
                    <span>${esc(i.categoria || 'Sem categoria')}</span>
                    <span>${i.tipo === 'recorrente' ? 'custo fixo' : dataBR(i.data)}</span>
                </p>
            </div>
            <span class="gs-linha__valor">${moeda(i.valor_centavos)}</span>
            <span class="gs-linha__lado">
                <span class="ds-chip">${i.tipo === 'recorrente' ? (i.ciclo === 'anual' ? 'anual' : 'mensal') : 'pontual'}</span>
            </span>
        </button>`).join('')}</div>`;
};

const vazio = (icone, texto) => `
    <div class="ds-empty gs-vazio">
        <span class="ds-empty__icon"><i data-lucide="${icone}"></i></span>
        <p class="ds-empty__text">${texto}</p>
    </div>`;

const ESTILOS = `
<style>
.iv-linha { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--bento-gap); align-items: start; }
/* Encerrado continua na lista, mas recuado: é histórico, não item de
   trabalho. Some da leitura sem sumir do registro. */
.iv-encerrado { opacity: 0.55; }
.iv-encerrado:hover { opacity: 1; }
@media (max-width: 1080px) { .iv-linha { grid-template-columns: minmax(0, 1fr); } }
</style>
`;
