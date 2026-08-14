import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { marcarAtivo, trocarSuave } from '../lib/ui.js';
import {
    moeda, dataBR, hoje, mesAtual, mesExtenso, somarMeses, esc, diasAte, paraCentavos,
} from '../lib/formato.js';
import {
    investimentosDoMes, investidoNoMes, custoFixoMensalizado, proximaRenovacao,
    parcelaDe, parcelasEmAberto, totalDeParcelas, indiceDaParcela,
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
        { nome: 'tipo', rotulo: 'Natureza', tipo: 'select',
          opcoes: [{ valor: 'recorrente', rotulo: 'Custo fixo (recorrente)' },
                   { valor: 'pontual',    rotulo: 'Compra pontual (à vista)' },
                   { valor: 'parcelado',  rotulo: 'Compra parcelada' }] },
        { nome: 'valor_centavos', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true, largura: 'metade' },
        { nome: 'parcelas', rotulo: 'Em quantas vezes', largura: 'metade',
          placeholder: '6', dica: 'Número de parcelas mensais.' },
        { nome: 'ciclo', rotulo: 'Ciclo', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'mensal', rotulo: 'Mensal' }, { valor: 'anual', rotulo: 'Anual' }] },
        { nome: 'data', rotulo: 'Data da 1ª cobrança', tipo: 'data', obrigatorio: true, largura: 'metade' },
        { nome: 'resumo', tipo: 'nota-viva' },
        { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', largura: 'metade',
          opcoes: CATEGORIAS.map(c => ({ valor: c, rotulo: c })) },
        { nome: 'fornecedor', rotulo: 'Fornecedor', largura: 'metade', placeholder: 'Adobe' },
        { nome: 'ativo', rotulo: 'Ainda está ativo', tipo: 'checkbox',
          dica: 'Ao desmarcar, o custo para de pesar nos meses seguintes — o histórico anterior permanece.' },
        { nome: 'nota', rotulo: 'Observação', tipo: 'textarea' },
    ];

    /* Mostra só o que faz sentido para a natureza escolhida, e recalcula a
       parcela enquanto a pessoa digita. Ciclo não existe em compra; parcelas
       não existem em assinatura. Antes isso era uma dica em letra pequena
       dizendo "ignorado nas compras pontuais" — que é o sistema pedindo para
       a pessoa preencher e prometendo não usar. */
    const viverFormulario = (painel) => {
        const campo = (nome) => painel.querySelector(`[data-campo="${nome}"]`);
        const tipo     = painel.querySelector('[name="tipo"]');
        const valor    = painel.querySelector('[name="valor_centavos"]');
        const parcelas = painel.querySelector('[name="parcelas"]');
        const resumo   = campo('resumo');

        /* Troca o texto do rótulo preservando o asterisco de obrigatório —
           ele é um elemento filho, e um textContent= cru o levaria embora. */
        const trocarRotulo = (nome, texto) => {
            const el = campo(nome).querySelector('.cp-campo__rotulo');
            const req = el.querySelector('.cp-req');
            el.textContent = texto + ' ';
            if (req) el.appendChild(req);
        };

        const pintar = () => {
            const t = tipo.value;
            campo('parcelas').hidden = t !== 'parcelado';
            campo('ciclo').hidden    = t !== 'recorrente';
            campo('ativo').hidden    = t !== 'recorrente';

            trocarRotulo('valor_centavos', t === 'parcelado' ? 'Valor total' : 'Valor');
            trocarRotulo('data', t === 'parcelado' ? 'Data da 1ª parcela'
                               : t === 'pontual'   ? 'Data da compra'
                               : 'Data da 1ª cobrança');

            if (t !== 'parcelado') { resumo.hidden = true; return; }

            const total = paraCentavos(valor.value);
            const n = Math.max(1, parseInt(parcelas.value, 10) || 0);
            if (!total || !parcelas.value) {
                resumo.hidden = false;
                resumo.textContent = 'Informe o valor total e o número de vezes para ver a parcela.';
                return;
            }
            const falso = { valor_centavos: total, parcelas: n };
            const primeira = parcelaDe(falso, 0);
            const ultima   = parcelaDe(falso, n - 1);
            resumo.hidden = false;
            resumo.innerHTML = primeira === ultima
                ? `<b>${n}x de ${moeda(primeira)}</b> — total de ${moeda(total)}.`
                : `<b>${n - 1}x de ${moeda(primeira)}</b> e a última de <b>${moeda(ultima)}</b>
                   — total de ${moeda(total)}. A sobra da divisão vai na última parcela.`;
        };

        tipo.addEventListener('change', pintar);
        valor.addEventListener('input', pintar);
        parcelas.addEventListener('input', pintar);
        pintar();
    };

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
        aoMontar: viverFormulario,
        aoSalvar: async ({ ativo, ...dados }) => {
            /* O formulário pergunta "ainda está ativo?"; o banco guarda
               QUANDO parou. A tradução acontece aqui, e não no campo, porque
               a data de encerramento é o que permite recalcular meses
               passados sem apagá-los — um booleano sozinho reescreveria o
               histórico toda vez que alguém cancelasse uma assinatura. */
            dados.encerrado_em = dados.tipo === 'recorrente' && !ativo
                ? (inv?.encerrado_em || hoje())
                : null;

            // Limpa o que não pertence à natureza escolhida. Sem isto, mudar
            // uma assinatura para compra parcelada deixaria `ciclo: 'mensal'`
            // no registro — inofensivo hoje, e exatamente o tipo de lixo que
            // faz um relatório futuro contar a linha duas vezes.
            dados.ciclo    = dados.tipo === 'recorrente' ? dados.ciclo : null;
            dados.parcelas = dados.tipo === 'parcelado'
                ? Math.max(1, parseInt(dados.parcelas, 10) || 1)
                : null;

            if (dados.tipo === 'parcelado' && dados.parcelas < 2) {
                throw new Error('Compra parcelada precisa de pelo menos 2 vezes. '
                              + 'Para pagamento único, escolha "Compra pontual".');
            }

            try {
                await store.investimentos.salvar(dados);
            } catch (e) {
                // A coluna nova pode não existir se a migração não rodou. A
                // mensagem crua do Postgres fala de schema cache e não ajuda
                // ninguém a resolver.
                if (/parcelas/.test(e.message || '')) {
                    throw new Error('O banco ainda não tem o campo de parcelas. '
                                  + 'Rode db/migracao-parcelas.sql no Supabase e tente de novo.');
                }
                throw e;
            }
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
        /* Coluna da esquerda: o que ainda vai cobrar de novo — assinatura
           ativa e parcelamento em andamento. A compra à vista não entra:
           ela já aconteceu e vive no histórico do mês, não numa lista de
           compromissos. */
        const compromissos = investimentos
            .filter(i => i.tipo === 'recorrente' || i.tipo === 'parcelado')
            .filter(i => filtro === 'todos' || i.tipo === filtro)
            .map(i => ({
                ...i,
                quando: proximaRenovacao(i),
                pagas: i.tipo === 'parcelado'
                    ? Math.min(totalDeParcelas(i), Math.max(0, indiceDaParcela(i, mes) + 1))
                    : null,
            }))
            .map(i => ({ ...i, quitado: i.tipo === 'parcelado' && i.pagas >= totalDeParcelas(i) }))
            .sort((a, b) => {
                // Encerrado e quitado descem; entre os vivos, o que vence antes.
                const aMorto = !!a.encerrado_em || a.quitado;
                const bMorto = !!b.encerrado_em || b.quitado;
                if (aMorto !== bMorto) return aMorto ? 1 : -1;
                return String(a.quando || '9999').localeCompare(String(b.quando || '9999'));
            });

        const doMes = investimentosDoMes(investimentos, mes)
            .filter(i => filtro === 'todos' || i.tipo === filtro)
            .sort((a, b) => String(b.data).localeCompare(String(a.data)));

        const totalMes = investidoNoMes(investimentos, mes);
        const fixoMensal = custoFixoMensalizado(investimentos);
        const ativos = investimentos.filter(i => i.tipo === 'recorrente' && !i.encerrado_em).length;
        const emAberto = parcelasEmAberto(investimentos, mes);
        const parceladosVivos = investimentos.filter(i =>
            i.tipo === 'parcelado' && indiceDaParcela(i, mes) + 1 < totalDeParcelas(i)).length;

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

                <!-- Dívida assumida que ainda não apareceu em fechamento
                     nenhum. É a pergunta "quanto já está comprometido", que
                     o custo fixo mensalizado não responde: parcelamento
                     acaba, assinatura não. -->
                <article class="ds-card gs-kpi ${emAberto ? 'gs-kpi--sai' : ''}">
                    <div class="gs-kpi__topo">
                        <span class="gs-kpi__rotulo">Parcelas em aberto</span>
                        <span class="gs-kpi__icone"><i data-lucide="credit-card"></i></span>
                    </div>
                    <span class="gs-kpi__valor">${moeda(emAberto)}</span>
                    <span class="gs-kpi__pe"><span>${
                        parceladosVivos
                            ? `${parceladosVivos} compra${parceladosVivos === 1 ? '' : 's'} ainda pagando`
                            : 'nada parcelado em aberto'
                    }</span></span>
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
                    <button class="gs-filtro" data-filtro="parcelado"  aria-pressed="false">Parceladas</button>
                    <button class="gs-filtro" data-filtro="pontual"    aria-pressed="false">À vista</button>
                </div>
            </section>

            <section class="iv-linha">
                <article class="ds-card gs-secao">
                    <div class="gs-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">Compromissos</h2>
                            <span class="ds-card-sub">Assinaturas e parcelamentos, pela próxima cobrança</span>
                        </div>
                    </div>
                    <div id="iv-fixos">${listaCompromissos(compromissos)}</div>
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
const listaCompromissos = (lista) => {
    if (!lista.length) return vazio('repeat', 'Nenhuma assinatura ou parcelamento em andamento.');

    return `<div class="gs-lista">${lista.map(i => {
        const parcelado = i.tipo === 'parcelado';
        const morto = !!i.encerrado_em || i.quitado;
        const dias = i.quando ? diasAte(i.quando) : null;
        const n = totalDeParcelas(i);

        /* No parcelado em andamento o destaque é a PARCELA: é ela que sai da
           conta todo mês, e o total vai na linha de apoio. Já quitado, a
           parcela deixou de ser notícia — o que informa é quanto a compra
           custou no fim, então o destaque volta a ser o total. */
        const destaque = !parcelado || i.quitado
            ? i.valor_centavos
            : parcelaDe(i, Math.min(i.pagas, n - 1));

        return `
        <button class="gs-linha ${morto ? 'iv-encerrado' : ''}" data-id="${esc(i.id)}">
            <span class="gs-linha__marca">
                <i data-lucide="${morto ? 'circle-check' : parcelado ? 'credit-card' : 'repeat'}"></i>
            </span>
            <div class="gs-linha__info">
                <p class="gs-linha__titulo">${esc(i.descricao)}</p>
                <p class="gs-linha__meta">
                    <span>${esc(i.fornecedor || i.categoria || 'Sem categoria')}</span>
                    ${parcelado
                        ? `<span>${n}x · total ${moeda(i.valor_centavos)}</span>`
                        : `<span>${i.ciclo === 'anual' ? 'anual' : 'mensal'}</span>`}
                    ${i.encerrado_em ? `<span>encerrado em ${dataBR(i.encerrado_em)}</span>` : ''}
                </p>
                ${parcelado ? `
                    <span class="iv-progresso" role="img"
                          aria-label="${i.pagas} de ${n} parcelas pagas">
                        <span style="width:${Math.round((i.pagas / n) * 100)}%"></span>
                    </span>` : ''}
            </div>
            <span class="gs-linha__valor">${moeda(destaque)}</span>
            <span class="gs-linha__lado">
                ${i.quitado ? `<span class="ds-chip ds-chip--success">quitado</span>`
                : i.encerrado_em ? `<span class="ds-chip">inativo</span>`
                : `<span class="ds-chip ${dias !== null && dias <= 7 ? 'ds-chip--warning' : ''}">
                       ${parcelado ? `${i.pagas}/${n} · ` : ''}${
                           dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}
                   </span>`}
            </span>
        </button>`;
    }).join('')}</div>`;
};

const listaMes = (doMes) => {
    if (!doMes.length) return vazio('receipt', 'Nenhuma cobrança neste mês.');

    const icone = { recorrente: 'repeat', parcelado: 'credit-card', pontual: 'shopping-bag' };

    return `<div class="gs-lista">${doMes.map(i => `
        <button class="gs-linha" data-id="${esc(i.id)}">
            <span class="gs-linha__marca"><i data-lucide="${icone[i.tipo] || 'shopping-bag'}"></i></span>
            <div class="gs-linha__info">
                <p class="gs-linha__titulo">${esc(i.descricao)}</p>
                <p class="gs-linha__meta">
                    <span>${esc(i.categoria || 'Sem categoria')}</span>
                    ${i.tipo === 'parcelado'
                        ? `<span>parcela ${i.parcela} de ${totalDeParcelas(i)}</span>`
                        : `<span>${i.tipo === 'recorrente' ? 'custo fixo' : dataBR(i.data)}</span>`}
                </p>
            </div>
            <!-- valor_no_mes, não valor_centavos: no parcelado o que pesa
                 neste mês é a parcela, não o total da compra. -->
            <span class="gs-linha__valor">${moeda(i.valor_no_mes)}</span>
            <span class="gs-linha__lado">
                <span class="ds-chip">${
                    i.tipo === 'recorrente' ? (i.ciclo === 'anual' ? 'anual' : 'mensal')
                    : i.tipo === 'parcelado' ? `${totalDeParcelas(i)}x`
                    : 'à vista'
                }</span>
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
/* Encerrado e quitado continuam na lista, mas recuados: é histórico, não
   item de trabalho. Somem da leitura sem sumir do registro. */
.iv-encerrado { opacity: 0.55; }
.iv-encerrado:hover { opacity: 1; }

/* Progresso do parcelamento — fininho, sob o nome. Responde "falta muito?"
   sem exigir a leitura do "3/6" ao lado. */
.iv-progresso {
    display: block; height: 3px; margin-top: 6px;
    border-radius: var(--radius-pill); background: var(--surface-4); overflow: hidden;
}
.iv-progresso > span {
    display: block; height: 100%; border-radius: var(--radius-pill);
    background: var(--data-2);
    transition: width var(--dur-base) var(--ease-out);
}
@media (max-width: 1080px) { .iv-linha { grid-template-columns: minmax(0, 1fr); } }
</style>
`;
