# Redefinição de senha — deixar profissional e fazer o link funcionar

O e-mail do print é o **template padrão do Supabase** (remetente
`noreply@mail.app.supabase.io`) e o link falha quase sempre por **configuração**,
não por código. Faça os 3 ajustes abaixo no painel do Supabase.

---

## 1) Corrigir o link (URL Configuration)
Supabase → **Authentication → URL Configuration**

- **Site URL:** `https://www.eaenglishclasses.com.br`
  (é o que o template usa em `{{ .SiteURL }}`. Se estiver errado, o link aponta
  para o lugar errado e “não funciona”.)
- **Redirect URLs** (clique em *Add URL* e inclua todas):
  - `https://www.eaenglishclasses.com.br/login`
  - `https://www.eaenglishclasses.com.br/**`
  - `https://maicondeivibs-lgtm-eaenglishclasse.vercel.app/login`  *(enquanto migra)*
  - `https://maicondeivibs-lgtm-eaenglishclasse.vercel.app/**`

> Se o destino do link não estiver nessa lista, o Supabase recusa o redirecionamento
> e o usuário vê erro. Esta é a causa nº 1 de “o link não funciona”.

---

## 2) Remetente profissional (Custom SMTP via Resend)
Supabase → **Authentication → Emails → SMTP Settings** → *Enable Custom SMTP*

- Host: `smtp.resend.com`
- Port: `465`  (ou `587`)
- Username: `resend`
- Password: **sua `RESEND_API_KEY`** (a mesma `re_...` já usada na Vercel)
- Sender email: `avisos@eaenglishclasses.com.br`  *(domínio já verificado no Resend)*
- Sender name: `EA English Classes`

Isso troca o remetente `…@mail.app.supabase.io` pelo da escola, melhora a entrega
e remove o rodapé “powered by Supabase”. (O SMTP padrão do Supabase também tem
limite baixo de envios; o Resend resolve isso.)

---

## 3) Template com a marca EA
Supabase → **Authentication → Emails → Reset Password**

- **Subject:** `Redefinição de senha — EA English Classes`
- **Message body** → aba **Source** → cole o conteúdo de **`supabase-email-reset.html`**
  (está na raiz do projeto).

O botão do template aponta para
`{{ .SiteURL }}/login?token_hash={{ .TokenHash }}&type=recovery`. O `login.html`
já foi atualizado para validar esse formato (`verifyOtp`) e abrir a tela
**“Definir nova senha”**. Também tratei: link expirado/já usado (mensagem
amigável) e o formato antigo por `#access_token` — então funciona com o template
novo **ou** com o padrão.

---

## Testar
1. Tela de login → **Esqueci a senha** → digite o e-mail → enviar.
2. Abra o e-mail (já com a cara da EA) → **Criar nova senha**.
3. Deve abrir o `login.html` direto na tela de definir senha → salve → faça login.

**Observações**
- O link é de uso único e expira. Se um antivírus/scanner de e-mail “abrir” o link
  antes de você, ele pode ser consumido — nesse caso é só pedir um novo.
- Não precisa mexer em variáveis de ambiente da Vercel para isto; o Custom SMTP
  fica todo no painel do Supabase.
