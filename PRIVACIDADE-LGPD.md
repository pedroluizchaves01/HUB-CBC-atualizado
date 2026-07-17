# Conformidade LGPD — CBCH

Este documento resume as medidas técnicas de proteção de dados já aplicadas no sistema e as
ações de **governança** que dependem de decisão do responsável pela empresa (não são código).

## Medidas técnicas já implementadas (art. 46 — segurança)

- **Fim do acesso público ao banco.** As regras do Firestore foram fechadas (`allow read,
  write: if false`). O navegador não acessa mais os dados diretamente — tudo passa pelo
  backend autenticado.
- **Autenticação real com senha protegida.** Senhas deixaram de ser texto puro; agora são
  guardadas com **hash bcrypt** e validadas no servidor. Nenhuma credencial vai no bundle.
- **Sessão assinada** (HMAC) com expiração de 12h, em cookie `httpOnly` — resistente a
  furto por script e a falsificação.
- **Segregação por cliente no servidor.** Um cliente só recebe os dados do próprio cadastro
  (projetos, transações e documentos dos seus projetos). Acaba o vazamento cross-tenant.
- **Segredos fora do código.** Token do Telegram, chave de sessão e credencial do Firebase
  vivem em variáveis de ambiente do servidor.
- **Endpoints protegidos** por sessão + **rate limit** (anti-abuso/brute-force) e cabeçalhos
  de segurança (Helmet). O proxy de download do Telegram valida o identificador (anti-SSRF).
- **Minimização na exposição.** O backend nunca devolve `passwordHash` nem o token do
  Telegram ao frontend.

## Ações de governança pendentes (dependem do responsável)

Estas exigem uma decisão de negócio/jurídica, não uma mudança de código:

1. **Base legal e informação ao titular (arts. 7º, 9º).** Definir a base legal do
   tratamento (execução de contrato/legítimo interesse) e informar clientes e leads sobre
   quais dados são tratados e com quem são compartilhados (Google/Gemini, Telegram).
2. **Compartilhamento com o Telegram e o Google (arts. 33, 39).** Comprovantes com CPF/CNPJ
   são enviados a esses terceiros. Avaliar: (a) manter o Telegram como armazenamento?
   (b) formalizar operador; (c) para o Gemini, é transferência internacional — decidir se
   mantém a IA opcional (hoje o motor interno de OCR roda **localmente**, sem enviar nada
   para fora, o que é a opção mais protetiva).
3. **Retenção e eliminação (arts. 15, 16).** Definir por quanto tempo guardar comprovantes e
   dados de clientes encerrados, e um processo de eliminação. Hoje a retenção é indefinida.
4. **Direitos do titular (art. 18).** Definir um canal para o titular pedir acesso, correção
   ou eliminação dos seus dados.
5. **Encarregado/DPO (art. 41).** Indicar um responsável pelo tratamento de dados.
6. **Incidente pretérito (art. 48).** As credenciais e a base estiveram publicamente
   expostas antes desta correção. Avaliar com apoio jurídico se houve acesso indevido e se
   cabe comunicação à ANPD/titulares. **Rotacione todas as senhas e o token do Telegram.**

## Recomendação sobre a IA de leitura de comprovantes

O motor interno de OCR (padrão) processa os comprovantes **dentro do seu próprio servidor**,
sem enviar dados a terceiros — é a opção mais alinhada à LGPD. Manter o Gemini desligado
(não definir `GEMINI_API_KEY`) evita a transferência internacional de documentos com dados
pessoais. Ligue-o apenas se precisar da precisão extra em fotos ruins, ciente do trade-off.
