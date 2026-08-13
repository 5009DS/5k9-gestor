import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { moeda, esc } from '../lib/formato.js';
import { porCliente, porIntegrante } from '../lib/calculo.js';
import { iniciais } from './painel.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CADASTROS — clientes e integrantes.

   As duas pontas do fluxo, lado a lado: de quem vem e para quem vai. São
   listas curtas por natureza (um estúdio tem dezenas de clientes, não
   milhares), então nada de busca ou paginação — o que existe cabe na tela.

   Cada linha mostra o acumulado de todos os tempos. É o que transforma o
   cadastro em informação: "Acme, R$ 48.000 em 6 pagamentos" responde mais
   que um nome e um e-mail.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Paleta de identificação, tirada da sequência de dados do design system.
   Serve para dar rosto às iniciais na lista — não carrega significado. */
const CORES = ['#A855FF', '#FF7A45', '#4FD1FF', '#FFC96B', '#3DDC97', '#D45AC0'];
const corSugerida = (quantos) => CORES[quantos % CORES.length];

export const renderCadastros = async (container) => {
    let clientes, integrantes, entradas, repasses;

    const carregar = async () => {
        [clientes, integrantes, entradas, repasses] = await Promise.all([
            store.clientes.listar(), store.integrantes.listar(),
            store.entradas.listar(), store.repasses.listar(),
        ]);
    };
    await carregar();

    const { content } = renderShell(container, {
        path: '/cadastros',
        title: 'Cadastros',
        subtitle: 'Quem paga e quem recebe.',
        actions: `
            <button class="ds-btn ds-btn--ghost" id="cd-novo-cliente">
                <i data-lucide="building-2"></i> Novo cliente
            </button>
            <button class="ds-btn ds-btn--primary" id="cd-novo-integrante">
                <i data-lucide="user-plus"></i> Novo integrante
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const recarregar = async () => {
        store.limparCache();
        await carregar();
        desenhar();
    };

    // ── Cliente ─────────────────────────────────────────────────────────
    const abrirCliente = (cliente = null) => abrirFormulario({
        titulo: cliente ? 'Editar cliente' : 'Novo cliente',
        subtitulo: cliente ? esc(cliente.nome) : 'De onde vem o dinheiro',
        campos: [
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Acme Studio' },
            { nome: 'empresa', rotulo: 'Razão social', largura: 'metade' },
            { nome: 'documento', rotulo: 'CNPJ ou CPF', largura: 'metade' },
            { nome: 'contato', rotulo: 'Contato', largura: 'metade', placeholder: 'e-mail ou telefone' },
            { nome: 'cor', rotulo: 'Cor', tipo: 'cor', largura: 'metade' },
            { nome: 'nota', rotulo: 'Observação', tipo: 'textarea' },
        ],
        valores: cliente || { cor: corSugerida(clientes.length) },
        aoSalvar: async (dados) => {
            await store.clientes.salvar(dados);
            await recarregar();
            toast(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.');
        },
        aoExcluir: cliente ? async () => {
            /* Excluir cliente NÃO apaga as entradas dele: o dinheiro entrou
               de verdade e sumir com a receita para arrumar um cadastro seria
               destruição silenciosa. As entradas passam a aparecer como "Sem
               cliente", que é feio e recuperável — o certo nessa ordem. */
            await store.clientes.excluir(cliente.id);
            await recarregar();
            toast('Cliente excluído. As entradas dele viraram "sem cliente".');
        } : null,
    });

    // ── Integrante ──────────────────────────────────────────────────────
    const abrirIntegrante = (integrante = null) => abrirFormulario({
        titulo: integrante ? 'Editar integrante' : 'Novo integrante',
        subtitulo: integrante ? esc(integrante.nome) : 'Quem recebe repasse',
        campos: [
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Fernanda Lima' },
            { nome: 'papel', rotulo: 'Função', largura: 'metade', placeholder: 'Direção de arte' },
            { nome: 'email', rotulo: 'E-mail', largura: 'metade' },
            { nome: 'chave_pix', rotulo: 'Chave Pix', largura: 'metade' },
            { nome: 'cor', rotulo: 'Cor', tipo: 'cor', largura: 'metade' },
            { nome: 'ativo', rotulo: 'Faz parte do time hoje', tipo: 'checkbox',
              dica: 'Inativo some da lista de novos repasses, mas o histórico permanece.' },
            { nome: 'nota', rotulo: 'Observação', tipo: 'textarea' },
        ],
        valores: integrante || { cor: corSugerida(integrantes.length), ativo: true },
        aoSalvar: async (dados) => {
            await store.integrantes.salvar(dados);
            await recarregar();
            toast(integrante ? 'Integrante atualizado.' : 'Integrante cadastrado.');
        },
        aoExcluir: integrante ? async () => {
            await store.integrantes.excluir(integrante.id);
            await recarregar();
            toast('Integrante excluído. Os repasses dele continuam no histórico.');
        } : null,
    });

    document.getElementById('cd-novo-cliente').addEventListener('click', () => abrirCliente());
    document.getElementById('cd-novo-integrante').addEventListener('click', () => abrirIntegrante());

    // ── Desenho ─────────────────────────────────────────────────────────
    const desenhar = () => {
        const porC = porCliente(entradas, clientes);
        const porI = porIntegrante(repasses, integrantes);

        content.innerHTML = `
            <section class="cd-linha">
                <article class="ds-card gs-secao">
                    <div class="gs-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">Clientes</h2>
                            <span class="ds-card-sub">${clientes.length} cadastrado${clientes.length === 1 ? '' : 's'} · total de todos os tempos</span>
                        </div>
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" data-add="cliente">
                            <i data-lucide="plus"></i> Adicionar
                        </button>
                    </div>
                    ${clientes.length ? `
                        <div class="gs-lista">
                            ${clientes.map(c => {
                                const t = porC.find(x => x.cliente.id === c.id);
                                return `
                                <button class="gs-linha" data-cliente="${esc(c.id)}">
                                    <span class="gs-linha__marca" style="background:${esc(c.cor || '#A855FF')}22;color:${esc(c.cor || '#A855FF')}">
                                        ${esc(iniciais(c.nome))}
                                    </span>
                                    <div class="gs-linha__info">
                                        <p class="gs-linha__titulo">${esc(c.nome)}</p>
                                        <p class="gs-linha__meta">
                                            <span>${esc(c.empresa || c.contato || 'Sem contato')}</span>
                                            <span>${t ? `${t.quantidade} pagamento${t.quantidade === 1 ? '' : 's'}` : 'nenhum pagamento'}</span>
                                        </p>
                                    </div>
                                    <span class="gs-linha__valor">${moeda(t?.total || 0)}</span>
                                    <span class="gs-linha__lado"><i data-lucide="chevron-right" class="cd-seta"></i></span>
                                </button>`;
                            }).join('')}
                        </div>` : vazio('building-2', 'Nenhum cliente cadastrado ainda.')}
                </article>

                <article class="ds-card gs-secao">
                    <div class="gs-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">Time</h2>
                            <span class="ds-card-sub">${integrantes.length} integrante${integrantes.length === 1 ? '' : 's'} · total repassado</span>
                        </div>
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" data-add="integrante">
                            <i data-lucide="plus"></i> Adicionar
                        </button>
                    </div>
                    ${integrantes.length ? `
                        <div class="gs-lista">
                            ${integrantes.map(i => {
                                const t = porI.find(x => x.integrante.id === i.id);
                                const inativo = i.ativo === false;
                                return `
                                <button class="gs-linha ${inativo ? 'cd-inativo' : ''}" data-integrante="${esc(i.id)}">
                                    <span class="gs-linha__marca" style="background:${esc(i.cor || '#A855FF')}22;color:${esc(i.cor || '#A855FF')}">
                                        ${esc(iniciais(i.nome))}
                                    </span>
                                    <div class="gs-linha__info">
                                        <p class="gs-linha__titulo">${esc(i.nome)}</p>
                                        <p class="gs-linha__meta">
                                            <span>${esc(i.papel || 'Integrante')}</span>
                                            ${inativo ? '<span>fora do time</span>' : ''}
                                            ${t?.previsto ? `<span>${moeda(t.previsto)} a pagar</span>` : ''}
                                        </p>
                                    </div>
                                    <span class="gs-linha__valor">${moeda(t?.pago || 0)}</span>
                                    <span class="gs-linha__lado"><i data-lucide="chevron-right" class="cd-seta"></i></span>
                                </button>`;
                            }).join('')}
                        </div>` : vazio('users', 'Nenhum integrante cadastrado ainda.')}
                </article>
            </section>
        `;

        content.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click',
            () => b.dataset.add === 'cliente' ? abrirCliente() : abrirIntegrante()));
        content.querySelectorAll('[data-cliente]').forEach(el => el.addEventListener('click',
            () => abrirCliente(clientes.find(c => c.id === el.dataset.cliente))));
        content.querySelectorAll('[data-integrante]').forEach(el => el.addEventListener('click',
            () => abrirIntegrante(integrantes.find(i => i.id === el.dataset.integrante))));

        if (window.lucide) lucide.createIcons();
    };

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────
const vazio = (icone, texto) => `
    <div class="ds-empty gs-vazio">
        <span class="ds-empty__icon"><i data-lucide="${icone}"></i></span>
        <p class="ds-empty__text">${texto}</p>
    </div>`;

const ESTILOS = `
<style>
.cd-linha { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--bento-gap); align-items: start; }
.cd-seta { width: 15px; height: 15px; color: var(--text-tertiary); }
.cd-inativo { opacity: 0.55; }
.cd-inativo:hover { opacity: 1; }
@media (max-width: 1080px) { .cd-linha { grid-template-columns: minmax(0, 1fr); } }
</style>
`;
