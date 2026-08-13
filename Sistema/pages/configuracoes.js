import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { theme } from '../theme.js';
import { moeda, hoje, esc } from '../lib/formato.js';
import { semearExemplo, limparExemplo, limparTudo, contarExemplo } from '../seed/exemplo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — conexão, cópia de segurança e aparência.

   A seção de conexão é a primeira porque é a que tem consequência: em modo
   local os números são deste navegador e de mais ninguém. Quem abrir o
   sistema pela primeira vez precisa esbarrar nessa informação antes de
   lançar três meses de fluxo de caixa achando que o time está vendo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderConfiguracoes = async (container) => {
    const dados = await store.tudo();
    const contagem = {
        clientes: dados.clientes.length,
        integrantes: dados.integrantes.length,
        entradas: dados.entradas.length,
        repasses: dados.repasses.length,
        investimentos: dados.investimentos.length,
    };
    const totalEntradas = dados.entradas
        .filter(e => e.status === 'recebido')
        .reduce((t, e) => t + (e.valor_centavos || 0), 0);
    const exemplos = await contarExemplo();

    const { content } = renderShell(container, {
        path: '/configuracoes',
        title: 'Configurações',
        subtitle: 'Conexão, cópia de segurança e aparência.',
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const local = store.modo === 'local';

    content.innerHTML = `
        <!-- ══ Conexão ═══════════════════════════════════════════════════ -->
        <article class="ds-card ${local ? '' : 'ds-card--lit'} gs-secao">
            <div class="gs-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Onde os dados estão</h2>
                    <span class="ds-card-sub">${local ? 'Apenas neste navegador' : 'Supabase — compartilhado com o time'}</span>
                </div>
                <span class="ds-chip ${local ? 'ds-chip--warning' : 'ds-chip--success'}">
                    ${local ? 'modo local' : 'conectado'}
                </span>
            </div>

            ${local ? `
                <p class="cf-texto">
                    Tudo que você lançar fica salvo <strong>neste navegador</strong>. Ninguém mais
                    do time enxerga, e limpar o cache apaga os dados. Serve para experimentar a
                    ferramenta — não para o fechamento de verdade.
                </p>
                <ol class="cf-passos">
                    <li>Crie um projeto novo em <code>supabase.com</code> — separado do 5K9 Forms.</li>
                    <li>No <b>SQL Editor</b>, cole e rode o conteúdo de <code>Sistema/db/schema.sql</code>.</li>
                    <li>Em <b>Authentication → Users → Add user</b>, crie o acesso de cada pessoa do time.</li>
                    <li>Em <b>Settings → API</b>, copie a <i>Project URL</i> e a chave <code>anon</code>.</li>
                    <li>Cole as duas em <code>Sistema/lib/supabase-config.js</code> e recarregue.</li>
                </ol>
                <p class="ds-hint ds-hint--aviso">
                    <i data-lucide="triangle-alert"></i>
                    Antes de conectar, exporte o que já lançou aqui — a troca de modo não leva os
                    dados junto. Depois de conectado, use "Importar" para subir o arquivo.
                </p>
            ` : `
                <p class="cf-texto">
                    Os dados vivem no Supabase e são os mesmos para todo o time. O acesso exige
                    login, e as políticas de segurança do banco (RLS) recusam qualquer leitura sem
                    sessão — não existe tela pública neste sistema.
                </p>
            `}
        </article>

        <!-- ══ Conteúdo ══════════════════════════════════════════════════ -->
        <article class="ds-card gs-secao">
            <div class="gs-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">O que está registrado</h2>
                    <span class="ds-card-sub">${moeda(totalEntradas)} em entradas recebidas</span>
                </div>
            </div>
            <div class="cf-numeros">
                ${Object.entries(contagem).map(([nome, n]) => `
                    <div class="cf-numero">
                        <span class="cf-numero__valor">${n}</span>
                        <span class="cf-numero__rotulo">${nome}</span>
                    </div>`).join('')}
            </div>
        </article>

        <!-- ══ Cópia de segurança ════════════════════════════════════════ -->
        <article class="ds-card gs-secao">
            <div class="gs-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Cópia de segurança</h2>
                    <span class="ds-card-sub">Um arquivo JSON com tudo</span>
                </div>
            </div>
            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-exportar">
                    <i data-lucide="download"></i> Exportar tudo
                </button>
                <button class="ds-btn ds-btn--ghost" id="cf-importar">
                    <i data-lucide="upload"></i> Importar arquivo
                </button>
                <input type="file" id="cf-arquivo" accept="application/json" hidden>
            </div>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                A importação <strong>substitui</strong> as coleções presentes no arquivo. Exporte
                antes, se houver algo que você não quer perder.
            </p>
        </article>

        <!-- ══ Aparência ═════════════════════════════════════════════════ -->
        <article class="ds-card gs-secao">
            <div class="gs-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Aparência</h2>
                    <span class="ds-card-sub">A escolha vale também para o 5K9 Forms</span>
                </div>
            </div>
            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-tema">
                    <i data-lucide="${theme.get() === 'dark' ? 'sun' : 'moon'}"></i>
                    ${theme.get() === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
                </button>
            </div>
        </article>

        <!-- ══ Dados de exemplo ══════════════════════════════════════════ -->
        <article class="ds-card gs-secao">
            <div class="gs-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Zona de testes</h2>
                    <span class="ds-card-sub">
                        ${exemplos
                            ? `${exemplos} registros de exemplo no sistema agora`
                            : 'Para conhecer a ferramenta antes de usar de verdade'}
                    </span>
                </div>
                ${exemplos ? '<span class="ds-chip ds-chip--accent">exemplos ativos</span>' : ''}
            </div>
            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-exemplo">
                    <i data-lucide="sparkles"></i>
                    ${exemplos ? 'Restaurar dados de exemplo' : 'Preencher com dados de exemplo'}
                </button>
                ${exemplos ? `
                    <button class="ds-btn ds-btn--ghost" id="cf-limpar-exemplo">
                        <i data-lucide="eraser"></i> Remover só os exemplos
                    </button>` : ''}
                <button class="ds-btn ds-btn--ghost cf-perigo" id="cf-limpar">
                    <i data-lucide="trash-2"></i> Apagar todos os dados
                </button>
            </div>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                Os exemplos podem ir e voltar quantas vezes você quiser: eles têm identificadores
                fixos, então recriá-los repõe exatamente os mesmos registros, com as datas
                recalculadas a partir do mês atual. <strong>Remover só os exemplos</strong> não
                toca no que você lançou de verdade — <strong>apagar todos os dados</strong> toca,
                e não tem volta.
            </p>
        </article>
    `;

    // ── Exportar ────────────────────────────────────────────────────────
    document.getElementById('cf-exportar').addEventListener('click', async () => {
        const pacote = await store.exportar();
        const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `5k9-gestor-${hoje()}.json`;
        a.click();
        // Sem o revoke o blob fica preso na memória da aba até recarregar.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Arquivo exportado.');
    });

    // ── Importar ────────────────────────────────────────────────────────
    const arquivo = document.getElementById('cf-arquivo');
    document.getElementById('cf-importar').addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', async () => {
        const f = arquivo.files?.[0];
        if (!f) return;
        try {
            const pacote = JSON.parse(await f.text());
            if (!pacote || typeof pacote !== 'object' || !('entradas' in pacote)) {
                throw new Error('Este arquivo não parece uma exportação do 5K9 Gestor.');
            }
            await store.importar(pacote);
            toast('Dados importados.');
            renderConfiguracoes(container);
        } catch (e) {
            console.error('[configuracoes] importação falhou:', e);
            toast(e.message || 'Não foi possível ler o arquivo.');
        } finally {
            // Zera o input: escolher o MESMO arquivo de novo não dispara
            // 'change' se o valor não mudar, e a segunda tentativa parecia
            // travada.
            arquivo.value = '';
        }
    });

    // ── Tema ────────────────────────────────────────────────────────────
    document.getElementById('cf-tema').addEventListener('click', () => {
        theme.alternar();
        renderConfiguracoes(container);
    });

    // ── Exemplo / limpeza ───────────────────────────────────────────────
    document.getElementById('cf-exemplo').addEventListener('click', async (e) => {
        // closest: o clique costuma cair no <i> do ícone, e desabilitar o
        // ícone não impede o segundo clique de disparar tudo de novo.
        const b = e.target.closest('button');
        b.disabled = true;
        b.textContent = 'Criando…';
        await semearExemplo();
        toast(exemplos ? 'Dados de exemplo restaurados.' : 'Dados de exemplo criados.');
        renderConfiguracoes(container);
    });

    document.getElementById('cf-limpar-exemplo')?.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        b.disabled = true;
        b.textContent = 'Removendo…';
        await limparExemplo();
        toast('Exemplos removidos. Seus lançamentos continuam aí.');
        renderConfiguracoes(container);
    });

    const btnLimpar = document.getElementById('cf-limpar');
    btnLimpar.addEventListener('click', async () => {
        // Dois toques no próprio botão, como no painel de edição: um
        // confirm() nativo é fácil demais de dispensar no automático.
        if (btnLimpar.dataset.confirmando !== 'sim') {
            btnLimpar.dataset.confirmando = 'sim';
            btnLimpar.classList.add('cf-perigo--confirma');
            btnLimpar.innerHTML = 'Confirmar: apagar tudo';
            setTimeout(() => {
                if (!btnLimpar.isConnected) return;
                btnLimpar.dataset.confirmando = '';
                btnLimpar.classList.remove('cf-perigo--confirma');
                btnLimpar.innerHTML = '<i data-lucide="trash-2"></i> Apagar todos os dados';
                if (window.lucide) lucide.createIcons();
            }, 5000);
            return;
        }
        await limparTudo();
        toast('Todos os dados foram apagados.');
        renderConfiguracoes(container);
    });

    if (window.lucide) lucide.createIcons();
};

const ESTILOS = `
<style>
.cf-texto { margin: 0; font-size: var(--text-body); color: var(--text-secondary); line-height: var(--leading-body); max-width: 68ch; }
.cf-texto strong { color: var(--text-primary); }

.cf-passos { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); max-width: 74ch; }
.cf-passos li { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
.cf-passos code {
    font-family: var(--font-mono); font-size: 12px;
    padding: 2px 6px; border-radius: var(--radius-xs);
    background: var(--surface-3); color: var(--text-primary);
}
.cf-passos b { color: var(--text-primary); }

.cf-numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-4); }
.cf-numero { display: flex; flex-direction: column; gap: var(--space-1); }
.cf-numero__valor { font-size: 26px; font-weight: 600; letter-spacing: var(--tracking-tight); font-variant-numeric: tabular-nums; color: var(--text-primary); }
.cf-numero__rotulo { font-size: var(--text-xs); color: var(--text-tertiary); text-transform: capitalize; }

.cf-acoes { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.cf-perigo:hover { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }
.cf-perigo--confirma { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }
</style>
`;
