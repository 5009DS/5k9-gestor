/* ═══════════════════════════════════════════════════════════════════════════
   CONEXÃO COM O BANCO

   O Gestor mora num projeto Supabase PRÓPRIO, separado do 5K9 Forms — é
   dinheiro, e dado financeiro não divide banco com formulário de cliente.

   Enquanto os dois campos abaixo estiverem vazios, o sistema roda em MODO
   LOCAL: tudo é gravado no localStorage deste navegador e mais ninguém do
   time enxerga. Serve para experimentar a interface sem depender de banco.

   Para ligar no Supabase de verdade:
     1. crie um projeto novo em supabase.com;
     2. rode db/schema.sql no SQL Editor dele;
     3. crie seu usuário em Authentication → Users → Add user;
     4. cole aqui a URL e a chave `anon` (Settings → API).

   A chave `anon` é pública por natureza — vai no bundle e qualquer pessoa a
   lê no DevTools. Quem protege os números é o RLS (ver db/schema.sql), que
   exige sessão autenticada para TUDO. Diferente do Forms, aqui não existe
   leitura pública: não há tela que gente de fora veja.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SUPABASE_URL  = '';
export const SUPABASE_ANON = '';

/** Há banco configurado? Se não, o store cai no adaptador local. */
export const CONFIGURADO = !!(SUPABASE_URL && SUPABASE_ANON);
