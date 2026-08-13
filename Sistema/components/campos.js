import { openDrawer, closeDrawer } from './drawer.js';
import { paraCentavos, paraCampo, esc } from '../lib/formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   FORMULÁRIO EM PAINEL LATERAL

   Cinco telas do Gestor lançam registros, e todas fazem a mesma coisa:
   abrem um painel, mostram campos, validam o obrigatório, devolvem um
   objeto. Escrever isso cinco vezes garante que as cinco divirjam — uma
   valida, outra não; uma converte moeda, outra esquece.

   Aqui o formulário é DECLARADO, não montado:

     abrirFormulario({
         titulo: 'Nova entrada',
         campos: [
             { nome: 'projeto', rotulo: 'Projeto', obrigatorio: true },
             { nome: 'valor_centavos', rotulo: 'Valor', tipo: 'moeda', obrigatorio: true },
             { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', opcoes: [...] },
         ],
         valores: entradaExistente,
         aoSalvar: async (dados) => { … },
     });

   `aoSalvar` recebe os valores já convertidos: moeda em centavos inteiros,
   caixas de seleção em booleano, vazios como null (nunca string vazia — no
   banco, '' e NULL são coisas diferentes na hora de filtrar).
   ═══════════════════════════════════════════════════════════════════════════ */

const campoHTML = (c, valores) => {
    const v = valores?.[c.nome];
    const id = `cp-${c.nome}`;
    const req = c.obrigatorio ? '<span class="cp-req">*</span>' : '';
    const dica = c.dica ? `<span class="cp-dica">${esc(c.dica)}</span>` : '';

    let controle;
    switch (c.tipo) {
        case 'moeda':
            /* inputmode decimal, não type=number: no celular o teclado
               numérico aparece igual, mas o campo aceita "1.500,00" com
               separadores. type=number rejeita a vírgula em locale pt-BR e
               o campo simplesmente fica vazio ao sair — sem erro visível. */
            controle = `
                <div class="cp-moeda">
                    <span class="cp-moeda__simbolo">R$</span>
                    <input class="ds-input" id="${id}" name="${c.nome}" inputmode="decimal"
                           placeholder="0,00" value="${v != null ? paraCampo(v) : ''}"
                           autocomplete="off">
                </div>`;
            break;
        case 'data':
            controle = `<input class="ds-input" id="${id}" name="${c.nome}" type="date" value="${esc(v || '')}">`;
            break;
        case 'select':
            controle = `
                <select class="ds-input" id="${id}" name="${c.nome}">
                    ${(c.opcoes || []).map(o => `
                        <option value="${esc(o.valor)}" ${String(v ?? '') === String(o.valor) ? 'selected' : ''}>
                            ${esc(o.rotulo)}
                        </option>`).join('')}
                </select>`;
            break;
        case 'textarea':
            controle = `<textarea class="ds-input cp-area" id="${id}" name="${c.nome}" rows="3"
                                  placeholder="${esc(c.placeholder || '')}">${esc(v || '')}</textarea>`;
            break;
        case 'checkbox':
            return `
                <label class="cp-check" for="${id}">
                    <input type="checkbox" id="${id}" name="${c.nome}" ${v ? 'checked' : ''}>
                    <span>${esc(c.rotulo)}</span>
                </label>
                ${dica}`;
        case 'cor':
            controle = `<input class="cp-cor" id="${id}" name="${c.nome}" type="color" value="${esc(v || '#A855FF')}">`;
            break;
        default:
            controle = `<input class="ds-input" id="${id}" name="${c.nome}" type="text"
                               placeholder="${esc(c.placeholder || '')}" value="${esc(v ?? '')}"
                               autocomplete="off">`;
    }

    return `
        <div class="cp-campo ${c.largura === 'metade' ? 'cp-campo--metade' : ''}">
            <label class="cp-campo__rotulo" for="${id}">${esc(c.rotulo)} ${req}</label>
            ${controle}
            ${dica}
        </div>`;
};

/** Lê o painel e devolve os valores já no tipo certo. */
const colher = (painel, campos) => {
    const dados = {};
    campos.forEach(c => {
        const el = painel.querySelector(`[name="${c.nome}"]`);
        if (!el) return;
        if (c.tipo === 'checkbox')   dados[c.nome] = el.checked;
        else if (c.tipo === 'moeda') dados[c.nome] = paraCentavos(el.value);
        else {
            const bruto = el.value.trim();
            // '' vira null: no Postgres string vazia não é ausência, e um
            // filtro "sem cliente" (is null) deixaria de encontrar a linha.
            dados[c.nome] = bruto === '' ? null : bruto;
        }
    });
    return dados;
};

export const abrirFormulario = ({
    titulo, subtitulo = '', campos, valores = null,
    rotuloSalvar = 'Salvar', aoSalvar, aoExcluir = null,
}) => {
    const corpo = `
        <form class="cp-form" id="cp-form" novalidate>
            ${campos.map(c => campoHTML(c, valores)).join('')}
            <p class="cp-erro" id="cp-erro" hidden></p>
        </form>`;

    const rodape = `
        ${aoExcluir ? `<button type="button" class="ds-btn ds-btn--ghost cp-excluir" id="cp-excluir">Excluir</button>` : ''}
        <span class="cp-espaco"></span>
        <button type="button" class="ds-btn ds-btn--ghost" id="cp-cancelar">Cancelar</button>
        <button type="button" class="ds-btn ds-btn--primary" id="cp-salvar">${esc(rotuloSalvar)}</button>`;

    return openDrawer({
        title: titulo, subtitle: subtitulo, body: corpo, footer: rodape,
        onMount: (painel) => {
            injectStyles();
            const erro = painel.querySelector('#cp-erro');
            const botao = painel.querySelector('#cp-salvar');

            const mostrarErro = (msg) => {
                erro.textContent = msg;
                erro.hidden = false;
            };

            const enviar = async () => {
                const dados = colher(painel, campos);

                const faltando = campos.find(c => c.obrigatorio &&
                    (dados[c.nome] == null || dados[c.nome] === '' ||
                     (c.tipo === 'moeda' && !dados[c.nome])));
                if (faltando) {
                    mostrarErro(`Preencha "${faltando.rotulo}".`);
                    painel.querySelector(`[name="${faltando.nome}"]`)?.focus();
                    return;
                }
                erro.hidden = true;

                // Trava o botão: o painel salva no banco, e um duplo clique
                // impaciente criava dois lançamentos idênticos — o tipo de
                // erro que só aparece no fechamento do mês.
                botao.disabled = true;
                botao.textContent = 'Salvando…';
                try {
                    await aoSalvar({ ...(valores || {}), ...dados });
                    closeDrawer();
                } catch (e) {
                    console.error('[campos] falha ao salvar:', e);
                    mostrarErro(e.message || 'Não foi possível salvar. Tente de novo.');
                    botao.disabled = false;
                    botao.textContent = rotuloSalvar;
                }
            };

            botao.addEventListener('click', enviar);
            painel.querySelector('#cp-cancelar').addEventListener('click', closeDrawer);

            // Enter salva, menos dentro do textarea, onde quebra linha.
            painel.querySelector('#cp-form').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    enviar();
                }
            });

            const excluir = painel.querySelector('#cp-excluir');
            if (excluir) excluir.addEventListener('click', async () => {
                // Confirmação em dois toques no próprio botão, sem abrir
                // outro diálogo por cima do painel: empilhar modal sobre
                // modal confunde o foco e o ESC passa a fechar o errado.
                if (excluir.dataset.confirmando !== 'sim') {
                    excluir.dataset.confirmando = 'sim';
                    excluir.classList.add('cp-excluir--confirma');
                    excluir.textContent = 'Confirmar exclusão';
                    setTimeout(() => {
                        if (!excluir.isConnected) return;
                        excluir.dataset.confirmando = '';
                        excluir.classList.remove('cp-excluir--confirma');
                        excluir.textContent = 'Excluir';
                    }, 4000);
                    return;
                }
                excluir.disabled = true;
                try {
                    await aoExcluir(valores);
                    closeDrawer();
                } catch (e) {
                    mostrarErro(e.message || 'Não foi possível excluir.');
                    excluir.disabled = false;
                }
            });
        },
    });
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('campos-styles')) return;
    const style = document.createElement('style');
    style.id = 'campos-styles';
    style.textContent = `
        .cp-form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
        /* Campo ocupa a linha inteira por padrão; --metade divide a linha.
           Grade de duas colunas com o padrão em span 2 evita o campo órfão
           quando o número de meias é ímpar. */
        .cp-campo { grid-column: span 2; display: flex; flex-direction: column; gap: var(--space-2); }
        .cp-campo--metade { grid-column: span 1; }

        .cp-campo__rotulo { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
        .cp-req { color: var(--accent); }
        .cp-dica { font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }

        .cp-area { height: auto; padding: var(--space-3) var(--space-4); resize: vertical; line-height: var(--leading-body); font-family: var(--font-sans); }

        /* ── Moeda ──────────────────────────────────────────────────────────
           O "R$" é do campo, não do valor: prefixo desenhado à esquerda e o
           input com recuo. Digitar "R$" junto do número obrigaria a limpar
           o símbolo na leitura toda vez. */
        .cp-moeda { position: relative; }
        .cp-moeda__simbolo {
            position: absolute; left: var(--space-4); top: 50%; transform: translateY(-50%);
            font-size: var(--text-sm); color: var(--text-tertiary); pointer-events: none;
        }
        .cp-moeda .ds-input {
            padding-left: 42px;
            font-variant-numeric: tabular-nums;
            font-size: var(--text-h3); font-weight: 600;
        }

        .cp-check {
            grid-column: span 2;
            display: flex; align-items: center; gap: var(--space-3);
            font-size: var(--text-sm); color: var(--text-primary); cursor: pointer;
        }
        .cp-check input { width: 17px; height: 17px; accent-color: var(--accent); cursor: pointer; }

        .cp-cor {
            width: 56px; height: 44px; padding: 4px;
            background: var(--surface-3); border: 1px solid var(--border-default);
            border-radius: var(--radius-md); cursor: pointer;
        }

        .cp-erro {
            grid-column: span 2; margin: 0;
            padding: var(--space-3) var(--space-4);
            background: var(--danger-muted); border-radius: var(--radius-md);
            font-size: var(--text-sm); color: var(--danger);
        }
        .cp-erro[hidden] { display: none; }

        .cp-espaco { flex: 1; }
        .cp-excluir { color: var(--text-tertiary); }
        .cp-excluir:hover { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }
        .cp-excluir--confirma { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }

        /* O rodapé do drawer alinha à direita; aqui o Excluir precisa ficar
           na ponta oposta, então o rodapé passa a distribuir. */
        .dw__footer { justify-content: flex-start; }

        @media (max-width: 520px) {
            .cp-campo--metade { grid-column: span 2; }
        }
    `;
    document.head.appendChild(style);
}
