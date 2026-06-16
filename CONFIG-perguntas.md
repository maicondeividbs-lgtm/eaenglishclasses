# Perguntas dos alunos — notificação + e-mail (passo a passo)

Fluxo: o **aluno envia uma pergunta** → o **professor** recebe push + e-mail.
O **professor responde** → o **aluno** recebe push + e-mail.
Tudo já está no código; falta só rodar o SQL e criar 2 webhooks.

## 1) Banco de dados
No Supabase → **SQL Editor**, rode o arquivo **`help_requests.sql`**.
Ele cria/ajusta a tabela, as políticas (RLS) e liga o Realtime (sino).

## 2) Webhooks (Supabase → Database → Webhooks → *Create a new hook*)
Crie **dois** hooks na tabela `public.help_requests`, marcando os eventos
**Insert** *e* **Update** nos dois (o Insert = pergunta nova; o Update = resposta).

> **Atenção ao domínio:** use a **mesma URL base** dos seus webhooks que já
> funcionam (push de homework/feedback). Uma letra errada no endereço já
> causou erro 404 antes.

**Hook A — Notificação (push)**
- Name: `push_help_requests`
- Table: `help_requests` · Events: **Insert + Update**
- Type: **HTTP Request** · Method: `POST`
- URL: `https://SEU-DOMINIO/api/send-push?secret=SEU_EA_PUSH_SECRET`
- Header: `Content-Type: application/json`

**Hook B — E-mail**
- Name: `email_help_requests`
- Table: `help_requests` · Events: **Insert + Update**
- Type: **HTTP Request** · Method: `POST`
- URL: `https://SEU-DOMINIO/api/send-email?secret=SEU_EA_PUSH_SECRET`
- Header: `Content-Type: application/json`

(Substitua `SEU-DOMINIO` e `SEU_EA_PUSH_SECRET` pelos valores reais — o
mesmo segredo `EA_PUSH_SECRET` já usado nos outros webhooks.)

## 3) Pronto
- O código só notifica/envia e-mail na **criação** (pergunta) e na **resposta**;
  marcar como “lido” **não** dispara nada (proteção contra envio duplicado).
- Para testar o push isolado: `POST /api/send-push` com
  `{"test":true,"user_id":"<id-do-professor>","cat":"pergunta"}`.
- Para testar o e-mail isolado: `POST /api/send-email` com
  `{"test":true,"to":"voce@exemplo.com","cat":"pergunta"}`.

## Sobre o ícone da notificação
O push agora usa a **logo da escola** (`icons/Logo_EA.jpg`) como imagem grande.
O quadradinho menor no canto (a logo do app, `icons/icon-192.png`) é colocado
automaticamente pelo Android a partir do `manifest.webmanifest` — por isso ele
já aparecia certo. A versão do Service Worker subiu para `ea-v10`; ao publicar,
teste em janela anônima ou limpe os dados do site para o ícone novo aparecer.
