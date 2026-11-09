# VENTURA 2.0

Projeto novo, independente do repositório antigo. Interface responsiva com identidade preta e dourada.

## Estrutura
- `index.html`, `styles.css`, `app.js`: aplicação web.
- `config.js`: configuração local da conexão.
- `supabase/schema.sql`: tabelas e políticas iniciais.
- `manifest.webmanifest` e `assets/icon.svg`: instalação como PWA.

## Configuração necessária
1. Crie um projeto novo no Supabase para o VENTURA 2.0.
2. No SQL Editor desse projeto, execute `supabase/schema.sql`.
3. Em Authentication > Users, crie o usuário administrador.
4. Copie o UUID desse usuário e execute o `insert` comentado no final do SQL.
5. Copie a Project URL e a chave publicável/anon para `config.js`.
6. Publique os arquivos em um NOVO repositório GitHub chamado `Ventura-2.0` e habilite GitHub Pages.

## Segurança
- Nunca coloque a chave `service_role`, senhas ou tokens privados no código do navegador.
- O painel verifica a sessão e a lista `admin_users`; as políticas RLS também protegem as tabelas.
- O envio público de agendamento cria somente solicitações pendentes. A confirmação é administrativa.
- Antes de usar com clientes reais, teste as políticas RLS e os fluxos de acesso.

## Recursos desta primeira base
- Catálogo público de serviços.
- Solicitação de agendamento.
- Login administrativo.
- Listagem e confirmação/cancelamento de agendamentos.
- Cadastro de serviços e registro/listagem de vendas.

## Próximas etapas
Calendário visual, cadastro/histórico de clientes, relatórios financeiros, configuração de Pix e link de WhatsApp serão adicionados em etapas seguintes.
