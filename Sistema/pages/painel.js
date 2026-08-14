import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import {
    moeda, moedaCurta, mesCurto, mesExtenso, mesAtual, somarMeses,
    dataBR, diasAte, esc, pct,
} from '../lib/formato.js';
import {
    fluxoDoMes, serieMensal, variacao, porCliente, porIntegrante,
    custoFixoMensalizado, proximaRenovacao, primeiroMesComDado, reservaDoEstudio,
} from '../lib/calculo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PAINEL — a resposta de uma tela só.

   A pergunta que originou o sistema é "quanto entrou este mês, de quem, e
   quanto disso já foi repassado". A página inteira é organizada nessa
   ordem: primeiro o fechamento do mês, depois o ano em barras, depois a
   origem (clientes) ao lado do destino (time), e por último o que está
   agendado para acontecer.

   Tudo é recortado pelo MÊS SELECIONADO, controlado pelo seletor no herói.
   Trocar de mês repinta só o conteúdo — a topnav e o título não piscam.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderPainel = async (container) => {
    const dados = await store.tudo();
    const { clientes, integrantes, entradas, repasses, investimentos } = dados;

    const limite = mesAtual();
    const primeiro = primeiroMesComDado(dados);
    let mes = limite;

    const { content } = renderShell(container, {
        path: '/',
        title: 'Painel Financeiro',
        subtitle: 'Quanto entrou, de quem veio e para onde foi.',
        actions: `
            <div class="gs-mes">
                <button class="ds-icon-btn" id="pn-ant" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                <span class="gs-mes__rotulo" id="pn-mes"></span>
                <button class="ds-icon-btn" id="pn-prox" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button>
            </div>
            <a href="/entradas" class="ds-btn ds-btn--primary">
                <i data-lucide="plus"></i> Lançar entrada
            </a>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const rotulo = document.getElementById('pn-mes');
    const btnAnt = document.getElementById('pn-ant');
    const btnProx = document.getElementById('pn-prox');

    const pintar = () => {
        rotulo.textContent = mesExtenso(mes);
        // Não deixa navegar para o futuro: mês que ainda não começou só teria
        // previsão, e o painel é de caixa realizado. Nem antes do primeiro
        // lançamento, onde só haveria zeros.
        btnProx.disabled = mes >= limite;
        btnAnt.disabled  = mes <= primeiro;

        content.innerHTML = corpo(dados, mes, { clientes, integrantes, entradas, repasses, investimentos });
        if (window.lucide) lucide.createIcons();
    };

    btnAnt.addEventListener('click',  () => { if (mes > primeiro) { mes = somarMeses(mes, -1); pintar(); } });
    btnProx.addEventListener('click', () => { if (mes < limite)   { mes = somarMeses(mes,  1); pintar(); } });

    pintar();
};

/* ═════ Corpo ═══════════════════════════════════════════════════════════ */
const corpo = (dados, mes, { clientes, integrantes, entradas, repasses, investimentos }) => {
    const f = fluxoDoMes(dados, mes);
    const anterior = fluxoDoMes(dados, somarMeses(mes, -1));

    const serie = serieMensal(dados, mes, 12);
    const teto = Math.max(...serie.flatMap(s => [s.entrou, s.saiu]), 1);

    const clientesDoMes = porCliente(entradas, clientes, mes).slice(0, 5);
    const timeDoMes     = porIntegrante(repasses, integrantes, mes);

    const fixoMensal = custoFixoMensalizado(investimentos);
    const reserva = reservaDoEstudio(repasses, investimentos, mes);

    // Renovações dos próximos 45 dias. A janela é curta de propósito: uma
    // lista de tudo que vence no ano vira parede de texto e ninguém lê.
    const renovacoes = investimentos
        .filter(i => i.tipo === 'recorrente' && !i.encerrado_em)
        .map(i => ({ inv: i, quando: proximaRenovacao(i) }))
        .filter(r => r.quando && diasAte(r.quando) <= 45)
        .sort((a, b) => a.quando.localeCompare(b.quando))
        .slice(0, 5);

    return `
        <!-- ══ Fechamento do mês ═══════════════════════════════════════ -->
        <section class="gs-kpis">
            ${kpi('Entrou no mês', f.entrou, 'arrow-down-left', 'entra',
                  delta(f.entrou, anterior.entrou),
                  f.aReceber ? `${moeda(f.aReceber)} ainda previsto` : '')}
            ${kpi('Repassado ao time', f.repassado, 'users', 'time',
                  delta(f.repassado, anterior.repassado),
                  // As duas informações convivem: uma explica o bruto, a
                  // outra o que falta. Trocar uma pela outra escondia a
                  // pendência justamente nos meses em que houve retenção.
                  [f.retido    ? `${moeda(f.retido)} retidos de ${moeda(f.bruto)} brutos` : '',
                   f.aRepassar ? `${moeda(f.aRepassar)} a pagar` : ''].filter(Boolean).join(' · '))}
            ${kpi('Investimentos', f.investido, 'receipt', 'sai',
                  delta(f.investido, anterior.investido),
                  `${moeda(fixoMensal)}/mês em custo fixo`)}
            ${kpiSaldo(f)}
        </section>

        <!-- ══ Ano em barras + pendências ══════════════════════════════ -->
        <section class="pn-linha pn-linha--1">
            ${cartaoGrafico(serie, teto, mes)}
            ${cartaoDivisao(f, reserva)}
        </section>

        <!-- ══ Origem e destino ════════════════════════════════════════ -->
        <section class="pn-linha pn-linha--2">
            ${cartaoClientes(clientesDoMes, f.entrou, mes)}
            ${cartaoTime(timeDoMes, f.repassado, mes)}
        </section>

        <!-- ══ Agenda ══════════════════════════════════════════════════ -->
        ${cartaoRenovacoes(renovacoes)}
    `;
};

/* ═════ Blocos ══════════════════════════════════════════════════════════ */

const delta = (atual, anterior) => {
    const v = variacao(atual, anterior);
    if (atual === 0 && anterior === 0) return '';
    return `<span class="ds-chip ${v >= 0 ? 'ds-chip--success' : 'ds-chip--danger'}">
                ${v >= 0 ? '↑' : '↓'} ${Math.abs(v)}%
            </span>`;
};

const kpi = (rotulo, valor, icone, variante, chip, pe) => `
    <article class="ds-card gs-kpi gs-kpi--${variante}">
        <div class="gs-kpi__topo">
            <span class="gs-kpi__rotulo">${rotulo}</span>
            <span class="gs-kpi__icone"><i data-lucide="${icone}"></i></span>
        </div>
        <span class="gs-kpi__valor">${moeda(valor)}</span>
        <span class="gs-kpi__pe">${chip}${pe ? `<span>${pe}</span>` : ''}</span>
    </article>`;

/* O saldo é o único indicador com fio de luz e brilho: é o número que a
   pessoa veio ver. Os outros três explicam como ele foi formado. */
const kpiSaldo = (f) => `
    <article class="ds-card ds-card--lit gs-kpi gs-kpi--saldo">
        <div class="gs-kpi__topo">
            <span class="gs-kpi__rotulo">Saldo do estúdio</span>
            <span class="gs-kpi__icone"><i data-lucide="wallet"></i></span>
        </div>
        <span class="gs-kpi__valor ${f.saldo < 0 ? 'gs-negativo' : ''}">${moeda(f.saldo)}</span>
        <span class="gs-kpi__pe"><span>${moeda(f.entrou)} − ${moeda(f.saiu)} em saídas</span></span>
    </article>`;

/* ── Gráfico de doze meses ───────────────────────────────────────────────
   Duas barras por mês, lado a lado: o que entrou e o que saiu. Empilhar as
   duas seria mais compacto e responderia a pergunta errada — o que se quer
   ver aqui é a DISTÂNCIA entre entrada e saída, que é o saldo, e distância
   se lê melhor entre duas colunas vizinhas do que dentro de uma pilha. */
const cartaoGrafico = (serie, teto, mesAtivo) => `
    <article class="ds-card ds-card--lit pn-gr">
        <div class="gs-secao__cabeca">
            <div>
                <h2 class="ds-card-title">Entradas e saídas</h2>
                <span class="ds-card-sub">Últimos 12 meses, até ${mesCurto(mesAtivo)}</span>
            </div>
            <div class="pn-legenda">
                <span class="pn-legenda__item"><i class="pn-amostra pn-amostra--entra"></i> Entrou</span>
                <span class="pn-legenda__item"><i class="pn-amostra pn-amostra--sai"></i> Saiu</span>
            </div>
        </div>

        <div class="pn-grafico">
            ${serie.map((s) => {
                const hEntra = s.entrou ? Math.max(4, Math.round((s.entrou / teto) * 88)) : 0;
                const hSai   = s.saiu   ? Math.max(4, Math.round((s.saiu   / teto) * 88)) : 0;
                const ativo  = s.mes === mesAtivo;
                return `
                <div class="pn-col ${ativo ? 'pn-col--ativa' : ''}"
                     title="${mesCurto(s.mes)} — entrou ${moeda(s.entrou)}, saiu ${moeda(s.saiu)}, saldo ${moeda(s.saldo)}">
                    <div class="pn-trilha">
                        ${!s.entrou && !s.saiu ? '<div class="pn-vazia"></div>' : ''}
                        <div class="pn-bar pn-bar--entra ${ativo ? 'pn-bar--agora' : ''}" style="height:${hEntra}%"></div>
                        <div class="pn-bar pn-bar--sai" style="height:${hSai}%"></div>
                    </div>
                    <span class="pn-col__rotulo">${mesCurto(s.mes)}</span>
                </div>`;
            }).join('')}
        </div>
    </article>`;

/* Pendências e divisão do mês: o que ainda não aconteceu, e para onde foi
   cada real do que aconteceu. */
const cartaoDivisao = (f, reserva) => {
    const base = f.entrou || 1;
    const fTime    = pct(f.repassado, base);
    const fEstudio = pct(f.retido, base);
    const fCusto   = pct(f.investido, base);
    const fSobra   = Math.max(0, 100 - fTime - fEstudio - fCusto);

    return `
    <div class="pn-coluna">
        <article class="ds-card pn-divisao">
            <h2 class="ds-card-title">Para onde foi</h2>
            <span class="ds-card-sub">Divisão de cada real que entrou no mês</span>

            <div class="pn-fita" role="img"
                 aria-label="Time ${fTime}%, reserva ${fEstudio}%, custos ${fCusto}%, livre ${fSobra}%">
                <span class="pn-fita__parte pn-fita__parte--time"    style="width:${fTime}%"></span>
                <span class="pn-fita__parte pn-fita__parte--estudio" style="width:${fEstudio}%"></span>
                <span class="pn-fita__parte pn-fita__parte--custo"   style="width:${fCusto}%"></span>
                <span class="pn-fita__parte pn-fita__parte--sobra"   style="width:${fSobra}%"></span>
            </div>

            <ul class="pn-fita__chaves">
                <li><i class="pn-amostra pn-amostra--time"></i> Time <b>${fTime}%</b></li>
                ${f.retido ? `<li><i class="pn-amostra pn-amostra--estudio"></i> Reserva <b>${fEstudio}%</b></li>` : ''}
                <li><i class="pn-amostra pn-amostra--custo"></i> Custos <b>${fCusto}%</b></li>
                <li><i class="pn-amostra pn-amostra--sobra"></i> Livre <b>${fSobra}%</b></li>
            </ul>

            <!-- A reserva é acumulada, não do mês: é um saldo. Fica sob a
                 fita porque explica o que aconteceu com a fatia retida ao
                 longo do tempo, não só neste mês. -->
            <hr class="ds-divider">
            <a href="/investimentos" class="pn-reserva">
                <span class="pn-reserva__texto">
                    <b>Reserva do estúdio</b>
                    <small>${moeda(reserva.separado)} retidos − ${moeda(reserva.gasto)} investidos</small>
                </span>
                <span class="pn-reserva__valor ${reserva.disponivel < 0 ? 'gs-negativo' : ''}">
                    ${moeda(reserva.disponivel)}
                </span>
            </a>
        </article>

        <article class="ds-card pn-pendencias">
            <h2 class="ds-card-title">Pendente</h2>
            <a href="/entradas" class="pn-pend">
                <span class="pn-pend__rotulo"><i data-lucide="hourglass"></i> A receber</span>
                <span class="pn-pend__valor">${moeda(f.aReceber)}</span>
            </a>
            <a href="/repasses" class="pn-pend">
                <span class="pn-pend__rotulo"><i data-lucide="hand-coins"></i> A repassar</span>
                <span class="pn-pend__valor">${moeda(f.aRepassar)}</span>
            </a>
        </article>
    </div>`;
};

const cartaoClientes = (lista, total, mes) => `
    <article class="ds-card gs-secao">
        <div class="gs-secao__cabeca">
            <div>
                <h2 class="ds-card-title">De onde veio</h2>
                <span class="ds-card-sub">Clientes que pagaram em ${mesCurto(mes)}</span>
            </div>
            <a href="/entradas" class="ds-btn ds-btn--ghost ds-btn--sm">Ver entradas</a>
        </div>
        ${lista.length ? `
            <div class="gs-lista">
                ${lista.map((c, i) => `
                    <div class="gs-linha pn-origem">
                        <span class="gs-linha__marca" style="${c.cliente.cor ? `background:${esc(c.cliente.cor)}22;color:${esc(c.cliente.cor)}` : ''}">
                            ${esc(iniciais(c.cliente.nome))}
                        </span>
                        <div class="gs-linha__info">
                            <p class="gs-linha__titulo">${esc(c.cliente.nome)}</p>
                            <p class="gs-linha__meta">
                                <span>${c.quantidade} pagamento${c.quantidade === 1 ? '' : 's'}</span>
                                <span>${pct(c.total, total || 1)}% do mês</span>
                            </p>
                        </div>
                        <span class="gs-linha__valor">${moeda(c.total)}</span>
                        <span class="pn-origem__barra" style="--i:${i}">
                            <span style="width:${pct(c.total, lista[0].total)}%"></span>
                        </span>
                    </div>`).join('')}
            </div>` : vazio('inbox', 'Nenhum pagamento recebido neste mês.')}
    </article>`;

const cartaoTime = (lista, total, mes) => `
    <article class="ds-card gs-secao">
        <div class="gs-secao__cabeca">
            <div>
                <h2 class="ds-card-title">Repasses do time</h2>
                <span class="ds-card-sub">Quem recebeu em ${mesCurto(mes)}</span>
            </div>
            <a href="/repasses" class="ds-btn ds-btn--ghost ds-btn--sm">Ver repasses</a>
        </div>
        ${lista.length ? `
            <div class="gs-lista">
                ${lista.map(t => `
                    <div class="gs-linha">
                        <span class="gs-linha__marca" style="${t.integrante.cor ? `background:${esc(t.integrante.cor)}22;color:${esc(t.integrante.cor)}` : ''}">
                            ${esc(iniciais(t.integrante.nome))}
                        </span>
                        <div class="gs-linha__info">
                            <p class="gs-linha__titulo">${esc(t.integrante.nome)}</p>
                            <p class="gs-linha__meta">
                                <span>${esc(t.integrante.papel || 'Integrante')}</span>
                                ${total ? `<span>${pct(t.pago, total)}% dos repasses</span>` : ''}
                            </p>
                        </div>
                        <span class="gs-linha__valor">${moeda(t.pago)}</span>
                        <span class="gs-linha__lado">
                            ${t.previsto
                                ? `<span class="ds-chip ds-chip--warning">${moeda(t.previsto)} a pagar</span>`
                                : `<span class="ds-chip ds-chip--success">em dia</span>`}
                        </span>
                    </div>`).join('')}
            </div>` : vazio('users', 'Nenhum repasse lançado neste mês.')}
    </article>`;

const cartaoRenovacoes = (renovacoes) => `
    <article class="ds-card gs-secao">
        <div class="gs-secao__cabeca">
            <div>
                <h2 class="ds-card-title">Renovações próximas</h2>
                <span class="ds-card-sub">Custos fixos que vencem nos próximos 45 dias</span>
            </div>
            <a href="/investimentos" class="ds-btn ds-btn--ghost ds-btn--sm">Ver investimentos</a>
        </div>
        ${renovacoes.length ? `
            <div class="gs-lista">
                ${renovacoes.map(({ inv, quando }) => {
                    const dias = diasAte(quando);
                    const urgente = dias <= 7;
                    return `
                    <div class="gs-linha">
                        <span class="gs-linha__marca"><i data-lucide="refresh-cw"></i></span>
                        <div class="gs-linha__info">
                            <p class="gs-linha__titulo">${esc(inv.descricao)}</p>
                            <p class="gs-linha__meta">
                                <span>${esc(inv.fornecedor || inv.categoria || 'Custo fixo')}</span>
                                <span>${inv.ciclo === 'anual' ? 'anual' : 'mensal'}</span>
                            </p>
                        </div>
                        <span class="gs-linha__valor">${moeda(inv.valor_centavos)}</span>
                        <span class="gs-linha__lado">
                            <span class="ds-chip ${urgente ? 'ds-chip--warning' : ''}">
                                ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`} · ${dataBR(quando)}
                            </span>
                        </span>
                    </div>`;
                }).join('')}
            </div>` : vazio('calendar-check', 'Nada vencendo nos próximos 45 dias.')}
    </article>`;

// ─────────────────────────────────────────────────────────────────────────
const vazio = (icone, texto) => `
    <div class="ds-empty gs-vazio">
        <span class="ds-empty__icon"><i data-lucide="${icone}"></i></span>
        <p class="ds-empty__text">${texto}</p>
    </div>`;

export const iniciais = (nome) => String(nome || '?')
    .split(' ').filter(Boolean).map(s => s.charAt(0)).slice(0, 2).join('').toUpperCase();

/* ═════ Estilos ═════════════════════════════════════════════════════════ */
const ESTILOS = `
<style>
.pn-linha { display: grid; gap: var(--bento-gap); }
.pn-linha--1 { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); }
.pn-linha--2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pn-coluna { display: flex; flex-direction: column; gap: var(--bento-gap); }

/* ── Gráfico ────────────────────────────────────────────────────────── */
.pn-gr { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }
.pn-legenda { display: flex; align-items: center; gap: var(--space-4); }
.pn-legenda__item { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--text-tertiary); }
.pn-amostra { width: 9px; height: 9px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
.pn-amostra--entra { background: var(--data-1); }
.pn-amostra--sai   { background: var(--surface-4); border: 1px solid var(--border-default); }
.pn-amostra--time    { background: var(--data-1); }
.pn-amostra--estudio { background: var(--data-3); }
.pn-amostra--custo   { background: var(--data-2); }
.pn-amostra--sobra   { background: var(--data-5); }

.pn-grafico { display: flex; align-items: flex-end; gap: var(--space-2); height: 210px; }
.pn-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; gap: var(--space-2); }
/* A trilha ocupa a altura livre e as barras são % dela — assim o rótulo do
   mês nunca é empurrado para fora do card. */
.pn-trilha { flex: 1; min-height: 0; display: flex; align-items: flex-end; justify-content: center; gap: 3px; position: relative; }
.pn-bar {
    width: 42%; max-width: 22px; border-radius: var(--radius-sm) var(--radius-sm) 3px 3px;
    transition: filter var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.pn-col:hover .pn-bar { transform: translateY(-2px); filter: brightness(1.15); }
.pn-bar--entra { background: var(--data-1); }
.pn-bar--sai   { background: var(--surface-4); border: 1px solid var(--border-default); }
/* Mês selecionado: gradiente da marca subindo devagar. Vertical porque a
   barra é estreita e alta — na horizontal a rampa vira uma borda dura. */
.pn-bar--agora {
    background: var(--gradient-flow-y);
    background-size: 100% 220%;
    box-shadow: var(--shadow-accent);
    animation: ds-rise 8s var(--ease-inout) infinite;
}
/* Mês sem movimento nenhum: hachura ocupando a base, para o vale existir na
   leitura em vez de virar um buraco sem explicação. */
.pn-vazia {
    position: absolute; left: 0; right: 0; bottom: 0; height: 6px;
    background: repeating-linear-gradient(-45deg, var(--data-neutral) 0 5px, transparent 5px 10px);
    border-radius: var(--radius-pill);
}
.pn-col__rotulo { font-size: var(--text-xs); color: var(--text-tertiary); text-align: center; }
.pn-col--ativa .pn-col__rotulo { color: var(--text-primary); font-weight: 600; }

/* ── Divisão do real ────────────────────────────────────────────────── */
.pn-divisao { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
.pn-fita { display: flex; height: 10px; border-radius: var(--radius-pill); overflow: hidden; background: var(--surface-4); }
.pn-fita__parte { display: block; height: 100%; transition: width var(--dur-base) var(--ease-out); }
.pn-fita__parte--time    { background: var(--data-1); }
.pn-fita__parte--estudio { background: var(--data-3); }
.pn-fita__parte--custo   { background: var(--data-2); }
.pn-fita__parte--sobra   { background: var(--data-5); }

/* ── Reserva do estúdio ──────────────────────────────────────────────── */
.pn-reserva {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-3); text-decoration: none;
    transition: border-color var(--dur-fast), background-color var(--dur-fast);
}
.pn-reserva:hover { border-color: var(--accent-border); background: var(--surface-4); }
.pn-reserva__texto { display: flex; flex-direction: column; min-width: 0; }
.pn-reserva__texto b { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
.pn-reserva__texto small { font-size: var(--text-xs); color: var(--text-tertiary); }
.pn-reserva__valor {
    font-size: var(--text-h3); font-weight: 600; color: var(--text-primary);
    font-variant-numeric: tabular-nums; white-space: nowrap;
}
.pn-fita__chaves { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-4); }
.pn-fita__chaves li { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); color: var(--text-tertiary); }
.pn-fita__chaves b { color: var(--text-primary); font-variant-numeric: tabular-nums; }

/* ── Pendências ─────────────────────────────────────────────────────── */
.pn-pendencias { padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
.pn-pend {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-3); text-decoration: none;
    transition: border-color var(--dur-fast), background-color var(--dur-fast);
}
.pn-pend:hover { border-color: var(--border-default); background: var(--surface-4); }
.pn-pend__rotulo { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); }
.pn-pend__rotulo i, .pn-pend__rotulo svg { width: 15px; height: 15px; color: var(--text-tertiary); }
.pn-pend__valor { font-size: var(--text-body); font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }

/* ── Origem: barra de participação na quarta coluna ─────────────────── */
.pn-origem__barra { width: 72px; height: 4px; border-radius: var(--radius-pill); background: var(--surface-4); overflow: hidden; flex-shrink: 0; }
.pn-origem__barra > span { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--data-1); }
.pn-origem:nth-child(2) .pn-origem__barra > span { background: var(--data-2); }
.pn-origem:nth-child(3) .pn-origem__barra > span { background: var(--data-3); }
.pn-origem:nth-child(4) .pn-origem__barra > span { background: var(--data-4); }
.pn-origem:nth-child(5) .pn-origem__barra > span { background: var(--data-5); }

@media (prefers-reduced-motion: reduce) { .pn-bar--agora { animation: none !important; } }

@media (max-width: 1180px) {
    .pn-linha--1, .pn-linha--2 { grid-template-columns: minmax(0, 1fr); }
    .pn-grafico { height: 170px; }
}
@media (max-width: 720px) {
    /* Doze colunas em 360px dão 20px cada; as duas barras somem. Metade da
       janela cabe e continua contando a história. */
    .pn-col:nth-child(-n+6) { display: none; }
    .pn-origem__barra { display: none; }
}
</style>
`;
