# Deploy (Coolify / docker-compose)

## Leitura automática de comprovantes — o que mudou

O endpoint `/api/office/analyze-receipt` (Gestão do Escritório → Nova Operação → Anexar
nota fiscal/comprovante) **não depende mais do Gemini**. Ele agora possui dois motores:

1. **Motor interno (padrão, zero configuração)** — OCR Tesseract (WASM, `por+eng`) para
   fotos/prints (JPG/PNG/WEBP) e extração da camada de texto de PDFs via `unpdf`, seguido
   de um parser de comprovantes brasileiros (PIX/TED/boleto — Nubank, Itaú, Bradesco, BB,
   Caixa, Inter, Sicoob, Santander, Mercado Pago, PicPay etc.). Extrai valor, data, quem
   pagou, quem recebeu, nº do comprovante (E2E/autenticação/protocolo), tipo e categoria.
   Os dados de idioma do OCR estão versionados em `tessdata/` — **nenhum download em
   runtime**.
2. **Gemini (opcional, recomendado para fotos ruins)** — se `GEMINI_API_KEY` estiver
   definida, o Gemini é tentado primeiro; em qualquer falha (chave inválida, cota,
   indisponibilidade) o sistema cai automaticamente para o motor interno em vez de dar erro.

A resposta da API informa `engine` (`"gemini"` ou `"ocr-interno"`) e `confidence` (0–1),
e a interface avisa o usuário qual motor foi usado.

## Variáveis de ambiente

| Variável         | Obrigatória? | Observação                                                                 |
| ---------------- | ------------ | -------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | **Não** (agora opcional) | Configure no Coolify para melhor precisão em fotos de baixa qualidade e para ler PDFs escaneados (sem camada de texto). Sem ela, o motor interno funciona com zero configuração. |
| `NODE_ENV`       | Já definida no compose (`production`) | —                                                           |

## Passos de deploy

1. Faça push/merge deste commit para o branch monitorado pelo Coolify.
2. **Rebuild obrigatório das duas imagens** (backend e frontend): há novas dependências de
   produção (`tesseract.js`, `unpdf`), a pasta `tessdata/` precisa entrar na imagem do
   backend (o `COPY . .` do `Dockerfile.backend` já a copia) e o frontend mudou.
3. (Opcional) Defina `GEMINI_API_KEY` no painel de variáveis do Coolify. Se não definir,
   nada quebra — o motor interno assume tudo.
4. Suba os containers. Não há passo extra de configuração: o servidor resolve `tessdata/`
   via `process.cwd()` (em produção, `/app/tessdata`).

## Notas e limites

- `tesseract.js` e `unpdf` estão em `dependencies` (sobrevivem ao `npm prune --production`
  do Dockerfile) e são WASM/JS puros — funcionam no `node:20-alpine` sem dependências nativas.
- A primeira leitura por OCR após o boot do container demora alguns segundos (inicialização
  do WASM); as seguintes reutilizam o mesmo worker e são rápidas.
- PDFs **escaneados** (sem camada de texto) não são lidos pelo motor interno — o usuário
  recebe orientação para enviar foto/print, ou o Gemini os lê se a chave estiver configurada.
- Fotos tortas, desfocadas ou com pouca luz reduzem a precisão do OCR; quando a confiança
  da leitura é baixa (< 0,6), a interface pede que o usuário confira os campos antes de salvar.
