import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { marcarAtivo, trocarSuave } from '../lib/ui.js';
import {
    moeda, dataBR, hoje, mesAtual, mesExtenso, somarMeses, chaveMes, esc, pct,
} from '../lib/formato.js';
import { porIntegrante, recebidoNoMes } from '../lib/calculo.js';
import { iniciais } from './painel.js';

/* ═══════════════════════════════════════════════════════════════════════════
   REPASSES — para onde o dinheiro vai.

   Cada linha é um valor efetivamente repassado (ou combinado) a um
   integrante, lançado em reais na mão. O sistema não calcula divisão: quem
   decide quanto cada um recebe é o time, e cada projeto tem um acordo
   próprio. O que o sistema garante é que o combinado fique registrado,
   datado e somado.

   O bloco do topo é o que importa no dia a dia: quanto cada pessoa já
   recebeu no mês e quanto ainda está em aberto.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderRepasses = async (container) => {
    let [repasses, integrantes, entradas] = await Promise.all([
        store.repasses.listar(), store.integrantes.listar(), store.entradas.listar(),
    ]);

    let mes = mesAtual();
    let escopo = 'mes';
    let situacao = 'todos';   // 'todos' | 'pago' | 'previsto'
    let quem = 'todos';       // id do integrante

    const { content } = renderShell(container, {
        path: '/repasses',
        title: 'Repasses',
        subtitle: 'Quanto foi repassado a cada integrante, e quando.',
        actions: `<button class="ds-btn ds-btn--primary" id="rp-novo">
                      <i data-lucide="plus"></i> Novo repasse
                  </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    // ── Formulário ──────────────────────────────────────────────────────
    const camposDe = () => [
        { nome: 'integrante_id', rotulo: 'Integrante', tipo: 'select', obrigatorio: true,
          opcoes: [{ valor: '', rotulo: integrantes.length ? 'Selecione…' : 'Nenhum integrante cadastrado' },
                   ...integrantes.filter(i => i.ativo !== false).map(i => ({ valor: i.id, rotulo: i.nome }))],
          dica: integrantes.length ? '' : 'Cadastre o time em Cadastros antes de lançar repasses.' },
        { nome: 'valor_centavos', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true, largura: 'metade' },
        { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, largura: 'metade' },
        { nome: 'status', rotulo: 'Situação', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'pago', rotulo: 'Pago' }, { valor: 'previsto', rotulo: 'A pagar' }],
          dica: 'Só o pago sai do caixa do mês.' },
        { nome: 'metodo', rotulo: 'Forma', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: '', rotulo: '—' },
                   { valor: 'pix', rotulo: 'Pix' }, { valor: 'ted', rotulo: 'Transferência' },
                   { valor: 'dinheiro', rotulo: 'Dinheiro' }, { valor: 'outro', rotulo: 'Outro' }] },
        /* Vincular à entrada é opcional, e as opções mostram valor e cliente:
           "Identidade Acme — R$ 8.000" é reconhecível; um id não é. Sem
           vínculo, o repasse continua válido — nem tudo que sai para o time
           corresponde a um projeto específico. */
        { nome: 'entrada_id', rotulo: 'Referente à entrada', tipo: 'select',
          opcoes: [{ valor: '', rotulo: 'Nenhuma em particular' },
                   ...entradas
                       .slice()
                       .sort((a, b) => String(b.data).localeCompare(String(a.data)))
                       .slice(0, 60)
                       .map(e => ({ valor: e.id,
                                    rotulo: `${e.projeto || 'Sem descrição'} — ${moeda(e.valor_centavos)} (${dataBR(e.data)})` }))],
          dica: 'Ajuda a saber se um projeto já foi dividido.' },
        { nome: 'nota', rotulo: 'Observação', tipo: 'textarea', placeholder: 'Parcela, acordo, referência…' },
    ];

    const recarregar = async () => {
        store.limparCache();
        [repasses, integrantes, entradas] = await Promise.all([
            store.repasses.listar(), store.integrantes.listar(), store.entradas.listar(),
        ]);
        desenhar();
    };

    const abrir = (repasse = null) => abrirFormulario({
        titulo: repasse ? 'Editar repasse' : 'Novo repasse',
        subtitulo: repasse
            ? esc(integrantes.find(i => i.id === repasse.integrante_id)?.nome || '')
            : 'Um valor repassado ou combinado com o time',
        campos: camposDe(),
        valores: repasse || { data: hoje(), status: 'pago' },
        rotuloSalvar: repasse ? 'Salvar' : 'Lançar',
        aoSalvar: async (dados) => {
            await store.repasses.salvar(dados);
            if (escopo === 'mes' && chaveMes(dados.data) !== mes) mes = chaveMes(dados.data);
            await recarregar();
            toast(repasse ? 'Repasse atualizado.' : 'Repasse lançado.');
        },
        aoExcluir: repasse ? async () => {
            await store.repasses.excluir(repasse.id);
            await recarregar();
            toast('Repasse excluído.');
        } : null,
    });

    document.getElementById('rp-novo').addEventListener('click', () => abrir());

    // ── Desenho ─────────────────────────────────────────────────────────
    const noPeriodo = () => repasses.filter(r => escopo === 'tudo' || chaveMes(r.data) === mes);

    const filtrar = () => noPeriodo()
        .filter(r => situacao === 'todos' || (r.status || 'pago') === situacao)
        .filter(r => quem === 'todos' || r.integrante_id === quem)
        .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    const desenhar = () => {
        const doPeriodo = noPeriodo();
        const resumo = porIntegrante(doPeriodo, integrantes);
        const totalPago = resumo.reduce((t, r) => t + r.pago, 0);
        // Base de comparação: quanto entrou no mesmo mês. Responde "que
        // fatia do faturamento virou repasse", que é a pergunta seguinte a
        // "quanto repassei".
        const entrou = escopo === 'mes' ? recebidoNoMes(entradas, mes) : 0;
        const lista = filtrar();

        content.innerHTML = `
            <section class="ds-card gs-barra">
                <div class="gs-mes">
                    ${escopo === 'mes' ? `
                        <button class="ds-icon-btn" id="rp-ant" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                        <span class="gs-mes__rotulo">${mesExtenso(mes)}</span>
                        <button class="ds-icon-btn" id="rp-prox" aria-label="Próximo mês"
                                ${mes >= mesAtual() ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
                    ` : `<span class="gs-mes__rotulo">Todo o histórico</span>`}
                    <button class="gs-filtro ${escopo === 'tudo' ? 'is-active' : ''}" id="rp-escopo">
                        ${escopo === 'mes' ? 'Ver tudo' : 'Ver por mês'}
                    </button>
                </div>

                <span class="gs-barra__espaco"></span>

                <div class="gs-filtros" id="rp-situacao">
                    <button class="gs-filtro" data-situacao="todos"    aria-pressed="false">Todos</button>
                    <button class="gs-filtro" data-situacao="pago"     aria-pressed="false">Pagos</button>
                    <button class="gs-filtro" data-situacao="previsto" aria-pressed="false">A pagar</button>
                </div>
            </section>

            ${resumo.length ? `
            <section class="rp-time">
                ${resumo.map(r => cartaoIntegrante(r, totalPago, quem)).join('')}
            </section>` : ''}

            <section class="ds-card gs-secao">
                <div class="gs-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">Lançamentos</h2>
                        <span class="ds-card-sub">
                            ${moeda(totalPago)} repassado${escopo === 'mes' && entrou
                                ? ` · ${pct(totalPago, entrou)}% do que entrou no mês` : ''}
                        </span>
                    </div>
                    ${quem !== 'todos' ? `
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rp-limpar">
                            <i data-lucide="x"></i> Ver todo o time
                        </button>` : ''}
                </div>
                <div id="rp-lista">${linhas(lista, integrantes, entradas)}</div>
            </section>
        `;

        marcarAtivo(document.getElementById('rp-situacao'), 'situacao', situacao);
        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    const ligarEventos = () => {
        document.getElementById('rp-situacao').addEventListener('click', (e) => {
            const b = e.target.closest('[data-situacao]');
            if (!b) return;
            situacao = b.dataset.situacao;
            marcarAtivo(document.getElementById('rp-situacao'), 'situacao', situacao);
            trocarSuave(document.getElementById('rp-lista'), () => {
                document.getElementById('rp-lista').innerHTML = linhas(filtrar(), integrantes, entradas);
                ligarLinhas();
                if (window.lucide) lucide.createIcons();
            });
        });

        document.getElementById('rp-escopo').addEventListener('click', () => {
            escopo = escopo === 'mes' ? 'tudo' : 'mes';
            desenhar();
        });
        document.getElementById('rp-ant')?.addEventListener('click', () => { mes = somarMeses(mes, -1); desenhar(); });
        document.getElementById('rp-prox')?.addEventListener('click', () => {
            if (mes < mesAtual()) { mes = somarMeses(mes, 1); desenhar(); }
        });
        document.getElementById('rp-limpar')?.addEventListener('click', () => { quem = 'todos'; desenhar(); });

        // Clicar num integrante filtra a lista por ele; clicar de novo solta.
        document.querySelectorAll('[data-quem]').forEach(el => {
            el.addEventListener('click', () => {
                quem = quem === el.dataset.quem ? 'todos' : el.dataset.quem;
                desenhar();
            });
        });

        ligarLinhas();
    };

    const ligarLinhas = () => {
        document.querySelectorAll('#rp-lista [data-id]').forEach(el => {
            el.addEventListener('click', () => abrir(repasses.find(x => x.id === el.dataset.id)));
        });
    };

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────
const cartaoIntegrante = (r, totalPago, quemAtivo) => {
    const i = r.integrante;
    const cor = i.cor || 'var(--accent)';
    return `
    <button class="ds-card ds-card--interactive rp-pessoa ${quemAtivo === i.id ? 'rp-pessoa--ativa' : ''}"
            data-quem="${esc(i.id)}" aria-pressed="${quemAtivo === i.id}">
        <span class="rp-pessoa__topo">
            <span class="rp-pessoa__avatar" style="background:${esc(cor)}22;color:${esc(cor)}">${esc(iniciais(i.nome))}</span>
            <span class="rp-pessoa__nome">
                <b>${esc(i.nome)}</b>
                <small>${esc(i.papel || 'Integrante')}</small>
            </span>
        </span>
        <span class="rp-pessoa__valor">${moeda(r.pago)}</span>
        <span class="rp-pessoa__pe">
            ${r.previsto
                ? `<span class="ds-chip ds-chip--warning">${moeda(r.previsto)} a pagar</span>`
                : `<span class="ds-chip ds-chip--success">em dia</span>`}
            ${totalPago ? `<span class="rp-pessoa__fatia">${pct(r.pago, totalPago)}%</span>` : ''}
        </span>
        <span class="gs-barra-prop"><span style="width:${pct(r.pago, totalPago || 1)}%; background:${esc(cor)}"></span></span>
    </button>`;
};

const linhas = (lista, integrantes, entradas) => {
    if (!lista.length) return `
        <div class="ds-empty gs-vazio">
            <span class="ds-empty__icon"><i data-lucide="hand-coins"></i></span>
            <p class="ds-empty__text">Nenhum repasse aqui.<br><strong>Lance o primeiro</strong> pelo botão acima.</p>
        </div>`;

    return `<div class="gs-lista">${lista.map(r => {
        const i = integrantes.find(x => x.id === r.integrante_id);
        const pago = (r.status || 'pago') === 'pago';
        const entrada = entradas.find(e => e.id === r.entrada_id);
        const cor = i?.cor;
        return `
        <button class="gs-linha" data-id="${esc(r.id)}">
            <span class="gs-linha__marca" style="${cor ? `background:${esc(cor)}22;color:${esc(cor)}` : ''}">
                ${i ? esc(iniciais(i.nome)) : '<i data-lucide="circle-help"></i>'}
            </span>
            <div class="gs-linha__info">
                <p class="gs-linha__titulo">${esc(i?.nome || 'Integrante removido')}</p>
                <p class="gs-linha__meta">
                    <span>${dataBR(r.data)}</span>
                    ${entrada ? `<span>ref. ${esc(entrada.projeto || 'entrada')}</span>` : ''}
                    ${r.nota ? `<span>${esc(r.nota)}</span>` : ''}
                </p>
            </div>
            <span class="gs-linha__valor">${moeda(r.valor_centavos)}</span>
            <span class="gs-linha__lado">
                <span class="ds-chip ${pago ? 'ds-chip--success' : 'ds-chip--warning'}">
                    ${pago ? 'pago' : 'a pagar'}
                </span>
            </span>
        </button>`;
    }).join('')}</div>`;
};

const ESTILOS = `
<style>
.rp-time { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: var(--bento-gap); }
.rp-pessoa {
    display: flex; flex-direction: column; gap: var(--space-3);
    padding: var(--space-5); text-align: left;
    font-family: var(--font-sans);
    background: var(--surface-2); cursor: pointer;
}
.rp-pessoa--ativa { border-color: var(--accent-border); box-shadow: var(--shadow-accent); }
.rp-pessoa__topo { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.rp-pessoa__avatar {
    width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--radius-pill);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: var(--text-xs); font-weight: 700;
}
.rp-pessoa__nome { display: flex; flex-direction: column; min-width: 0; }
.rp-pessoa__nome b {
    font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rp-pessoa__nome small { font-size: var(--text-xs); color: var(--text-tertiary); }
.rp-pessoa__valor {
    font-size: 24px; font-weight: 600; letter-spacing: var(--tracking-tight);
    color: var(--text-primary); font-variant-numeric: tabular-nums;
}
.rp-pessoa__pe { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.rp-pessoa__fatia { font-size: var(--text-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
</style>
`;
