import { store } from './store.js';
import { theme } from './theme.js';
import { navegar, caminhoAtual, interceptarLinks } from './lib/rotas.js';

import { renderPainel } from './pages/painel.js';
import { renderEntradas } from './pages/entradas.js';
import { renderRepasses } from './pages/repasses.js';
import { renderInvestimentos } from './pages/investimentos.js';
import { renderCadastros } from './pages/cadastros.js';
import { renderConfiguracoes } from './pages/configuracoes.js';
import { renderLogin } from './pages/login.js';

/* ═══════════════════════════════════════════════════════════════════════════
   5K9 GESTOR — roteador.

   Mesma estrutura do 5K9 Forms: SPA sobre a History API, sem build, módulos
   ES servidos direto. Diferenças que valem nota:

     · Não existe rota pública. No Forms, /f/… é preenchido por gente de
       fora; aqui toda tela é interna, e o roteador não tem exceção nenhuma
       a abrir.
     · A classe .ds entra no <html> e nunca sai — o sistema inteiro nasceu
       sobre o design system, então não há overlay legado a desligar.
   ═══════════════════════════════════════════════════════════════════════════ */

const app = document.getElementById('app');

theme.init();

const resolver = (caminho) => ({
    '/':              () => renderPainel(app),
    '/entradas':      () => renderEntradas(app),
    '/repasses':      () => renderRepasses(app),
    '/investimentos': () => renderInvestimentos(app),
    '/cadastros':     () => renderCadastros(app),
    '/configuracoes': () => renderConfiguracoes(app),
    '/login':         () => renderLogin(app),
}[caminho] || null);

let caminhoCorrente = null;

const roteador = async () => {
    const caminho = caminhoAtual();

    /* Em modo local não há sessão a exigir; a tela de login nem é oferecida.
       Em modo remoto, sem usuário só existe /login — e a troca usa
       `substituir` para o login não virar parada no histórico, senão o botão
       "voltar" joga a pessoa de volta nele depois de entrar. */
    if (store.exigeLogin) {
        if (!store.usuario() && caminho !== '/login') return navegar('/login', { substituir: true });
        if (store.usuario() && caminho === '/login')  return navegar('/', { substituir: true });
    } else if (caminho === '/login') {
        return navegar('/', { substituir: true });
    }

    if (caminho === caminhoCorrente) return;

    const desenhar = async () => {
        app.innerHTML = '';
        const render = resolver(caminho);
        if (render) {
            try {
                await render();
            } catch (e) {
                console.error('[app] falha ao desenhar a página:', e);
                app.innerHTML = erroHTML(e);
            }
        } else {
            app.innerHTML = naoEncontrado();
        }
        requestAnimationFrame(() => { if (window.lucide) lucide.createIcons(); });
        caminhoCorrente = caminho;
    };

    await desenhar();
};

// Uma falha ao carregar não pode deixar a tela em branco sem explicação.
const erroHTML = (e) => `
    <div class="app-aviso">
        <h2>Algo quebrou ao montar esta tela</h2>
        <p>${String(e?.message || e)}</p>
        <a href="/" class="ds-btn ds-btn--ghost ds-btn--sm">Voltar ao painel</a>
    </div>`;

const naoEncontrado = () => `
    <div class="app-aviso">
        <h2>Página não encontrada</h2>
        <p>O endereço não corresponde a nenhuma tela do Gestor.</p>
        <a href="/" class="ds-btn ds-btn--ghost ds-btn--sm">Ir para o painel</a>
    </div>`;

window.addEventListener('popstate', roteador);
interceptarLinks();

/* A sessão precisa estar resolvida ANTES do primeiro desenho: a topnav lê
   store.usuario() de forma síncrona para montar o avatar e o menu. */
store.iniciarSessao().then(() => {
    roteador();
    // Login/logout em outra aba, ou token expirado: reavalia a rota atual
    // em vez de deixar a tela desatualizada.
    store.aoMudarSessao(() => { caminhoCorrente = null; roteador(); });
});

export { roteador };
