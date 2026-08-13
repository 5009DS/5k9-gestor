import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { marcarAtivo, trocarSuave } from '../lib/ui.js';
import {
    moeda, dataBR, hoje, mesAtual, mesExtenso, somarMeses, chaveMes, esc,
} from '../lib/formato.js';
import { repassadoDaEntrada } from '../lib/calculo.js';
import { iniciais } from './painel.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ENTRADAS — de onde vem o dinheiro.

   Cada linha é um pagamento de um cliente: projeto, valor, data e situação
   (recebido ou previsto). O recorte padrão é o mês corrente, com um atalho
   para ver o ano inteiro — porque conferir "quanto esse cliente já pagou no
   total" é uma pergunta tão comum quanto o fechamento do mês.

   A lista mostra quanto de cada entrada já virou repasse. É o vínculo que
   responde, sem sair da tela, se um projeto já foi dividido com o time.
   ═══════════════════════════════════════════════════════════════════════════ */

const METODOS = [
    { valor: 'pix',       rotulo: 'Pix' },
    { valor: 'ted',       rotulo: 'Transferência' },
    { valor: 'boleto',    rotulo: 'Boleto' },
    { valor: 'cartao',    rotulo: 'Cartão' },
    { valor: 'dinheiro',  rotulo: 'Dinheiro' },
    { valor: 'outro',     rotulo: 'Outro' },
];

export const renderEntradas = async (container) => {
    let [entradas, clientes, repasses] = await Promise.all([
        store.entradas.listar(), store.clientes.listar(), store.repasses.listar(),
    ]);

    let mes = mesAtual();
    let escopo = 'mes';        // 'mes' | 'tudo'
    let situacao = 'todas';    // 'todas' | 'recebido' | 'previsto'
    let busca = '';

    const { content } = renderShell(container, {
        path: '/entradas',
        title: 'Entradas',
        subtitle: 'Cada pagamento que chega ao estúdio, e de quem.',
        actions: `<button class="ds-btn ds-btn--primary" id="en-nova">
                      <i data-lucide="plus"></i> Nova entrada
                  </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    // ── Formulário ──────────────────────────────────────────────────────
    const camposDe = () => [
        { nome: 'projeto', rotulo: 'Projeto ou descrição', obrigatorio: true,
          placeholder: 'Identidade visual — fase 1' },
        { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: '', rotulo: clientes.length ? 'Selecione…' : 'Nenhum cliente cadastrado' },
                   ...clientes.map(c => ({ valor: c.id, rotulo: c.nome }))],
          dica: clientes.length ? '' : 'Cadastre clientes em Cadastros para agrupar as entradas.' },
        { nome: 'valor_centavos', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true, largura: 'metade' },
        { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, largura: 'metade' },
        { nome: 'status', rotulo: 'Situação', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'recebido', rotulo: 'Recebido' }, { valor: 'previsto', rotulo: 'Previsto' }],
          dica: 'Só o recebido entra no caixa do mês.' },
        { nome: 'metodo', rotulo: 'Forma de pagamento', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: '', rotulo: '—' }, ...METODOS] },
        { nome: 'nota', rotulo: 'Observação', tipo: 'textarea',
          placeholder: 'Nota fiscal, parcela, combinado…' },
    ];

    const recarregar = async () => {
        store.limparCache();
        [entradas, clientes, repasses] = await Promise.all([
            store.entradas.listar(), store.clientes.listar(), store.repasses.listar(),
        ]);
        desenhar();
    };

    const abrir = (entrada = null) => abrirFormulario({
        titulo: entrada ? 'Editar entrada' : 'Nova entrada',
        subtitulo: entrada ? esc(entrada.projeto) : 'Um pagamento recebido ou previsto',
        campos: camposDe(),
        valores: entrada || { data: hoje(), status: 'recebido' },
        rotuloSalvar: entrada ? 'Salvar' : 'Lançar',
        aoSalvar: async (dados) => {
            await store.entradas.salvar(dados);
            // Se a entrada foi para outro mês, o filtro segue o lançamento —
            // salvar e ver a lista sem a linha que você acabou de criar é o
            // caminho mais curto para achar que o sistema perdeu o dado.
            if (escopo === 'mes' && chaveMes(dados.data) !== mes) mes = chaveMes(dados.data);
            await recarregar();
            toast(entrada ? 'Entrada atualizada.' : 'Entrada lançada.');
        },
        aoExcluir: entrada ? async () => {
            await store.entradas.excluir(entrada.id);
            await recarregar();
            toast('Entrada excluída.');
        } : null,
    });

    document.getElementById('en-nova').addEventListener('click', () => abrir());

    // ── Desenho ─────────────────────────────────────────────────────────
    const filtrar = () => {
        const termo = busca.trim().toLowerCase();
        return entradas
            .filter(e => escopo === 'tudo' || chaveMes(e.data) === mes)
            .filter(e => situacao === 'todas' || (e.status || 'recebido') === situacao)
            .filter(e => {
                if (!termo) return true;
                const cliente = clientes.find(c => c.id === e.cliente_id);
                return `${e.projeto || ''} ${cliente?.nome || ''} ${e.nota || ''}`
                    .toLowerCase().includes(termo);
            })
            .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    };

    const desenhar = () => {
        const lista = filtrar();
        const recebido = lista.filter(e => e.status === 'recebido')
            .reduce((t, e) => t + (e.valor_centavos || 0), 0);
        const previsto = lista.filter(e => e.status !== 'recebido')
            .reduce((t, e) => t + (e.valor_centavos || 0), 0);

        content.innerHTML = `
            <section class="ds-card gs-barra">
                <div class="ds-search gs-barra__busca">
                    <i data-lucide="search"></i>
                    <input type="text" id="en-busca" placeholder="Buscar por projeto, cliente ou observação…"
                           value="${esc(busca)}" aria-label="Buscar entradas">
                </div>

                <div class="gs-filtros" id="en-situacao">
                    <button class="gs-filtro" data-situacao="todas"    aria-pressed="false">Todas</button>
                    <button class="gs-filtro" data-situacao="recebido" aria-pressed="false">Recebidas</button>
                    <button class="gs-filtro" data-situacao="previsto" aria-pressed="false">Previstas</button>
                </div>

                <div class="gs-mes" id="en-periodo">
                    ${escopo === 'mes' ? `
                        <button class="ds-icon-btn" id="en-ant" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                        <span class="gs-mes__rotulo">${mesExtenso(mes)}</span>
                        <button class="ds-icon-btn" id="en-prox" aria-label="Próximo mês"
                                ${mes >= mesAtual() ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
                    ` : `<span class="gs-mes__rotulo">Todo o histórico</span>`}
                    <button class="gs-filtro ${escopo === 'tudo' ? 'is-active' : ''}" id="en-escopo">
                        ${escopo === 'mes' ? 'Ver tudo' : 'Ver por mês'}
                    </button>
                </div>
            </section>

            <section class="en-resumo">
                <div class="ds-card en-resumo__item">
                    <span class="gs-kpi__rotulo">Recebido</span>
                    <span class="gs-kpi__valor gs-positivo">${moeda(recebido)}</span>
                </div>
                <div class="ds-card en-resumo__item">
                    <span class="gs-kpi__rotulo">Previsto</span>
                    <span class="gs-kpi__valor">${moeda(previsto)}</span>
                </div>
                <div class="ds-card en-resumo__item">
                    <span class="gs-kpi__rotulo">Lançamentos</span>
                    <span class="gs-kpi__valor">${lista.length}</span>
                </div>
            </section>

            <section class="ds-card gs-secao">
                <div id="en-lista">${linhas(lista, clientes, repasses)}</div>
            </section>
        `;

        marcarAtivo(document.getElementById('en-situacao'), 'situacao', situacao);
        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    const ligarEventos = () => {
        const campoBusca = document.getElementById('en-busca');
        campoBusca.addEventListener('input', (e) => {
            busca = e.target.value;
            // Repinta só a lista: redesenhar a seção inteira tiraria o foco
            // do campo e a pessoa perderia o cursor a cada letra.
            const alvo = document.getElementById('en-lista');
            alvo.innerHTML = linhas(filtrar(), clientes, repasses);
            ligarLinhas();
            if (window.lucide) lucide.createIcons();
        });

        document.getElementById('en-situacao').addEventListener('click', (e) => {
            const b = e.target.closest('[data-situacao]');
            if (!b) return;
            situacao = b.dataset.situacao;
            marcarAtivo(document.getElementById('en-situacao'), 'situacao', situacao);
            trocarSuave(document.getElementById('en-lista'), () => {
                document.getElementById('en-lista').innerHTML = linhas(filtrar(), clientes, repasses);
                ligarLinhas();
                if (window.lucide) lucide.createIcons();
            });
        });

        document.getElementById('en-escopo').addEventListener('click', () => {
            escopo = escopo === 'mes' ? 'tudo' : 'mes';
            desenhar();
        });
        document.getElementById('en-ant')?.addEventListener('click', () => { mes = somarMeses(mes, -1); desenhar(); });
        document.getElementById('en-prox')?.addEventListener('click', () => {
            if (mes < mesAtual()) { mes = somarMeses(mes, 1); desenhar(); }
        });

        ligarLinhas();
    };

    const ligarLinhas = () => {
        document.querySelectorAll('#en-lista [data-id]').forEach(el => {
            el.addEventListener('click', () => abrir(entradas.find(x => x.id === el.dataset.id)));
        });
    };

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────
const linhas = (lista, clientes, repasses) => {
    if (!lista.length) return `
        <div class="ds-empty gs-vazio">
            <span class="ds-empty__icon"><i data-lucide="inbox"></i></span>
            <p class="ds-empty__text">Nenhuma entrada aqui.<br><strong>Lance a primeira</strong> pelo botão acima.</p>
        </div>`;

    return `<div class="gs-lista">${lista.map(e => {
        const cliente = clientes.find(c => c.id === e.cliente_id);
        const recebido = (e.status || 'recebido') === 'recebido';
        const jaRepassado = repassadoDaEntrada(repasses, e.id);
        return `
        <button class="gs-linha" data-id="${esc(e.id)}">
            <span class="gs-linha__marca" style="${cliente?.cor ? `background:${esc(cliente.cor)}22;color:${esc(cliente.cor)}` : ''}">
                ${cliente ? esc(iniciais(cliente.nome)) : '<i data-lucide="circle-help"></i>'}
            </span>
            <div class="gs-linha__info">
                <p class="gs-linha__titulo">${esc(e.projeto || 'Sem descrição')}</p>
                <p class="gs-linha__meta">
                    <span>${esc(cliente?.nome || 'Sem cliente')}</span>
                    <span>${dataBR(e.data)}</span>
                    ${e.metodo ? `<span>${esc(rotuloMetodo(e.metodo))}</span>` : ''}
                    ${jaRepassado ? `<span>${moeda(jaRepassado)} repassado</span>` : ''}
                </p>
            </div>
            <span class="gs-linha__valor ${recebido ? 'gs-positivo' : ''}">${moeda(e.valor_centavos)}</span>
            <span class="gs-linha__lado">
                <span class="ds-chip ${recebido ? 'ds-chip--success' : 'ds-chip--warning'}">
                    ${recebido ? 'recebido' : 'previsto'}
                </span>
            </span>
        </button>`;
    }).join('')}</div>`;
};

const rotuloMetodo = (v) => METODOS.find(m => m.valor === v)?.rotulo || v;

const ESTILOS = `
<style>
.en-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--bento-gap); }
.en-resumo__item { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
</style>
`;
