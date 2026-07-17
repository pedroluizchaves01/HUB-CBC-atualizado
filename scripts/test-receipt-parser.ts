// scripts/test-receipt-parser.ts
// Testes unitários do parser interno de comprovantes brasileiros.
// Execução: npx tsx scripts/test-receipt-parser.ts

import { parseReceiptText, ParsedReceipt } from '../src/lib/receiptParser';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(sample: string, field: string, actual: any, expected: any, mode: 'eq' | 'contains' | 'gte' = 'eq') {
  let ok = false;
  if (mode === 'eq') ok = actual === expected;
  else if (mode === 'contains') ok = typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
  else if (mode === 'gte') ok = typeof actual === 'number' && actual >= expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`[${sample}] ${field}: esperado ${mode === 'contains' ? 'conter ' : mode === 'gte' ? '>= ' : ''}${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

function run(sample: string, text: string, assertions: (r: ParsedReceipt) => void) {
  const r = parseReceiptText(text);
  console.log(`\n=== ${sample} ===`);
  console.log(JSON.stringify(r, null, 2));
  assertions(r);
}

// ---------------------------------------------------------------------------
// 1. Nubank — PIX enviado
// ---------------------------------------------------------------------------
run('Nubank PIX', `
Comprovante de transferência
12 JUL 2026 - 14:32:11

Valor
R$ 1.540,50

Tipo de transferência
Pix

Destino
Nome           João da Silva
CPF            •••.123.456-••
Instituição    BANCO XYZ S.A.
Agência        0001
Conta          12345-6

Origem
Nome           Escritorio CBC Arquitetura LTDA
CNPJ           12.345.678/0001-90
Instituição    NU PAGAMENTOS - IP

ID da transação
E60701190202607121732s0866093ac9
`, (r) => {
  check('Nubank PIX', 'value', r.value, 1540.5);
  check('Nubank PIX', 'date', r.date, '2026-07-12');
  check('Nubank PIX', 'type', r.type, 'saida');
  check('Nubank PIX', 'receiverName', r.receiverName, 'João da Silva', 'contains');
  check('Nubank PIX', 'receiverDoc', r.receiverDoc, '123.456', 'contains');
  check('Nubank PIX', 'payerName', r.payerName, 'CBC Arquitetura', 'contains');
  check('Nubank PIX', 'payerDoc', r.payerDoc, '12.345.678/0001-90', 'contains');
  check('Nubank PIX', 'documentNumber', r.documentNumber, 'E60701190202607121732s0866093ac9');
  check('Nubank PIX', 'description', r.description, 'PIX para João da Silva', 'contains');
  check('Nubank PIX', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 2. Itaú — PIX pagamento
// ---------------------------------------------------------------------------
run('Itaú PIX', `
Comprovante de Pix
Pagamento efetuado

Valor da transação: R$ 850,00
Data da transação: 05/07/2026

Dados de quem recebeu
Nome: Maria Souza Marcenaria ME
CPF/CNPJ: 23.456.789/0001-12
Instituição: BCO BRADESCO S.A.
Chave Pix: maria@marcenaria.com.br

Dados de quem pagou
Nome: Escritorio CBC Arquitetura LTDA
CPF/CNPJ: ***.987.654-**
Instituição: ITAU UNIBANCO S.A.

ID/transação: E18236120202607051429abc123def45
`, (r) => {
  check('Itaú PIX', 'value', r.value, 850);
  check('Itaú PIX', 'date', r.date, '2026-07-05');
  check('Itaú PIX', 'type', r.type, 'saida');
  check('Itaú PIX', 'receiverName', r.receiverName, 'Maria Souza Marcenaria', 'contains');
  check('Itaú PIX', 'payerName', r.payerName, 'CBC Arquitetura', 'contains');
  check('Itaú PIX', 'payerDoc', r.payerDoc, '987.654', 'contains');
  check('Itaú PIX', 'documentNumber', r.documentNumber, 'E18236120202607051429abc123def45');
  check('Itaú PIX', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 3. Banco do Brasil — transferência enviada
// ---------------------------------------------------------------------------
run('BB Transferência', `
BANCO DO BRASIL
Comprovante de transferência enviada

Data do pagamento: 28/06/2026
Valor: R$ 2.300,00

Debitado de
Nome: CBC ARQUITETURA LTDA
CNPJ: 12.345.678/0001-90
Agência: 1234-5
Conta: 67.890-1

Creditado em
Nome: CONSTRUTORA ALFA LTDA
CNPJ: 98.765.432/0001-10
Banco: 341 - ITAU UNIBANCO

Número do documento: 000123456789
Autenticação: A1B2C3D4E5F6
`, (r) => {
  check('BB Transferência', 'value', r.value, 2300);
  check('BB Transferência', 'date', r.date, '2026-06-28');
  check('BB Transferência', 'type', r.type, 'saida');
  check('BB Transferência', 'payerName', r.payerName, 'CBC ARQUITETURA', 'contains');
  check('BB Transferência', 'receiverName', r.receiverName, 'CONSTRUTORA ALFA', 'contains');
  check('BB Transferência', 'receiverDoc', r.receiverDoc, '98.765.432/0001-10', 'contains');
  check('BB Transferência', 'documentNumber', r.documentNumber, '000123456789');
  check('BB Transferência', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 4. Caixa — PIX pagamento de imposto (ISS)
// ---------------------------------------------------------------------------
run('Caixa PIX ISS', `
CAIXA ECONOMICA FEDERAL
Comprovante de Pagamento PIX

Valor pago: R$ 356,78
Data: 20/06/2026 09:15

Pagador
Nome: CBC ARQUITETURA LTDA
CNPJ: 12.345.678/0001-90

Recebedor
Nome: PREFEITURA MUNICIPAL DE SAO PAULO
CNPJ: 46.395.000/0001-39
Descrição: ISS - Imposto Sobre Serviços

Protocolo: 20260620091512345
`, (r) => {
  check('Caixa PIX ISS', 'value', r.value, 356.78);
  check('Caixa PIX ISS', 'date', r.date, '2026-06-20');
  check('Caixa PIX ISS', 'type', r.type, 'saida');
  check('Caixa PIX ISS', 'category', r.category, 'impostos');
  check('Caixa PIX ISS', 'payerName', r.payerName, 'CBC ARQUITETURA', 'contains');
  check('Caixa PIX ISS', 'receiverName', r.receiverName, 'PREFEITURA MUNICIPAL', 'contains');
  check('Caixa PIX ISS', 'documentNumber', r.documentNumber, '20260620091512345');
  check('Caixa PIX ISS', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 5. Inter — PIX recebido (entrada)
// ---------------------------------------------------------------------------
run('Inter PIX recebido', `
Banco Inter
Pix recebido

Você recebeu um Pix
R$ 4.500,00
15 de julho de 2026 às 16:42

De
Marcos Villela
CPF: ***.222.333-**
Banco: NU PAGAMENTOS

Para
CBC ARQUITETURA LTDA
CNPJ: 12.345.678/0001-90
Banco Inter S.A.

ID da transação: E00416968202607151642xyz98765432
Referência: Projeto residencial - entrada 2/3
`, (r) => {
  check('Inter PIX recebido', 'value', r.value, 4500);
  check('Inter PIX recebido', 'date', r.date, '2026-07-15');
  check('Inter PIX recebido', 'type', r.type, 'entrada');
  check('Inter PIX recebido', 'category', r.category, 'servico_projeto');
  check('Inter PIX recebido', 'payerName', r.payerName, 'Marcos Villela', 'contains');
  check('Inter PIX recebido', 'receiverName', r.receiverName, 'CBC ARQUITETURA', 'contains');
  check('Inter PIX recebido', 'documentNumber', r.documentNumber, 'E00416968202607151642xyz98765432');
  check('Inter PIX recebido', 'description', r.description, 'PIX recebido de Marcos Villela', 'contains');
  check('Inter PIX recebido', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 6. Mercado Pago — transferência
// ---------------------------------------------------------------------------
run('Mercado Pago', `
Mercado Pago
Comprovante de transferência

Total
R$ 320,00

Segunda-feira, 29 de junho de 2026

Para
Ana Paula Fretes e Mudanças
CPF: 234.567.890-11
Mercado Pago

De
CBC Arquitetura LTDA
CNPJ: 12.345.678/0001-90

Número de operação: 91827364550
`, (r) => {
  check('Mercado Pago', 'value', r.value, 320);
  check('Mercado Pago', 'date', r.date, '2026-06-29');
  check('Mercado Pago', 'type', r.type, 'saida');
  check('Mercado Pago', 'receiverName', r.receiverName, 'Ana Paula', 'contains');
  check('Mercado Pago', 'payerName', r.payerName, 'CBC Arquitetura', 'contains');
  check('Mercado Pago', 'documentNumber', r.documentNumber, '91827364550');
  check('Mercado Pago', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 7. Bradesco — TED
// ---------------------------------------------------------------------------
run('Bradesco TED', `
BRADESCO INTERNET BANKING
Comprovante de Transferência - TED

Data da operação: 02/07/2026
Valor: R$ 12.000,00

Remetente: CBC ARQUITETURA LTDA
CPF/CNPJ: 12.345.678/0001-90
Agência: 1234 Conta: 56789-0

Favorecido: JOSE CARLOS ENGENHARIA LTDA
CPF/CNPJ: 55.666.777/0001-88
Banco: 001 - BANCO DO BRASIL
Agência: 4321 Conta: 09876-5

Número do documento: 12345678
Autenticação: 4D5E6F7A8B9C0D1E
`, (r) => {
  check('Bradesco TED', 'value', r.value, 12000);
  check('Bradesco TED', 'date', r.date, '2026-07-02');
  check('Bradesco TED', 'type', r.type, 'saida');
  check('Bradesco TED', 'payerName', r.payerName, 'CBC ARQUITETURA', 'contains');
  check('Bradesco TED', 'receiverName', r.receiverName, 'JOSE CARLOS ENGENHARIA', 'contains');
  check('Bradesco TED', 'documentNumber', r.documentNumber, '12345678');
  check('Bradesco TED', 'description', r.description, 'TED para JOSE CARLOS', 'contains');
  check('Bradesco TED', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 8. Santander — boleto de energia (utilidades)
// ---------------------------------------------------------------------------
run('Santander Boleto', `
SANTANDER - Comprovante de Pagamento de Boleto

Beneficiário: ENEL DISTRIBUICAO SAO PAULO
CNPJ do Beneficiário: 61.695.227/0001-93
Pagador: CBC ARQUITETURA LTDA

Data de pagamento: 10/07/2026
Valor do documento: R$ 487,63
Número do documento: 23790.12345 67890.123456 78901.234567 8 91230000048763
Autenticação bancária: 7A8B9C0D1E2F3A4B
`, (r) => {
  check('Santander Boleto', 'value', r.value, 487.63);
  check('Santander Boleto', 'date', r.date, '2026-07-10');
  check('Santander Boleto', 'type', r.type, 'saida');
  check('Santander Boleto', 'category', r.category, 'utilidades');
  check('Santander Boleto', 'receiverName', r.receiverName, 'ENEL', 'contains');
  check('Santander Boleto', 'payerName', r.payerName, 'CBC ARQUITETURA', 'contains');
  check('Santander Boleto', 'documentNumber', r.documentNumber, '23790', 'contains');
  check('Santander Boleto', 'description', r.description, 'boleto', 'contains');
});

// ---------------------------------------------------------------------------
// 9. Sicoob — PIX aluguel
// ---------------------------------------------------------------------------
run('Sicoob PIX', `
SICOOB - Sistema de Cooperativas de Crédito
Comprovante de Pix - Pagamento efetuado
Data/Hora: 08/07/2026 11:22:33

Valor: R$ 1.200,00

Quem pagou
Nome: CBC ARQUITETURA LTDA
CPF/CNPJ: 12.345.678/0001-90
Instituição: SICOOB

Quem recebeu
Nome: IMOBILIARIA CENTRAL LTDA
CPF/CNPJ: 44.555.666/0001-77
Instituição: BCO SANTANDER
Descrição: Aluguel escritório julho/2026

E2E: E756958522026070811223309876abcd
`, (r) => {
  check('Sicoob PIX', 'value', r.value, 1200);
  check('Sicoob PIX', 'date', r.date, '2026-07-08');
  check('Sicoob PIX', 'type', r.type, 'saida');
  check('Sicoob PIX', 'category', r.category, 'aluguel_escritorio');
  check('Sicoob PIX', 'payerName', r.payerName, 'CBC ARQUITETURA', 'contains');
  check('Sicoob PIX', 'receiverName', r.receiverName, 'IMOBILIARIA CENTRAL', 'contains');
  check('Sicoob PIX', 'documentNumber', r.documentNumber, 'E756958522026070811223309876abcd');
  check('Sicoob PIX', 'confidence', r.confidence, 0.9, 'gte');
});

// ---------------------------------------------------------------------------
// 10. PicPay — pagamento simples
// ---------------------------------------------------------------------------
run('PicPay', `
PicPay - Comprovante de pagamento

Você pagou R$ 95,00 para

Loja de Materiais ConstruMax
CNPJ: 11.222.333/0001-44

12/07/2026 às 18:05
Código da transação: PP-2026-8877665544
`, (r) => {
  check('PicPay', 'value', r.value, 95);
  check('PicPay', 'date', r.date, '2026-07-12');
  check('PicPay', 'type', r.type, 'saida');
  check('PicPay', 'receiverName', r.receiverName, 'ConstruMax', 'contains');
  check('PicPay', 'documentNumber', r.documentNumber, 'PP-2026-8877665544');
  check('PicPay', 'confidence', r.confidence, 0.6, 'gte');
});

// ---------------------------------------------------------------------------
// 11. Orçamento de pedreiro via WhatsApp (texto livre)
// ---------------------------------------------------------------------------
run('WhatsApp Orçamento', `
Orçamento - Zé da Silva Pedreiro

Serviço de reboco e contrapiso do escritório
Mão de obra: 15 diárias x R$ 180,00 = R$ 2.700,00
Material por conta do cliente

Total geral: R$ 2.700,00
Pagamento: 50% adiantado
Chave pix: 11 98765-4321
`, (r) => {
  check('WhatsApp Orçamento', 'value', r.value, 2700);
  check('WhatsApp Orçamento', 'type', r.type, 'saida');
  check('WhatsApp Orçamento', 'category', r.category, 'colaboradores');
  check('WhatsApp Orçamento', 'receiverName', r.receiverName, 'Zé da Silva Pedreiro', 'contains');
});

// ---------------------------------------------------------------------------
// 12. Print de planilha Excel (texto livre)
// ---------------------------------------------------------------------------
run('Print Excel', `
Planilha de Custos - Obra Residencial Alphaville
Item        Descrição                Fornecedor           Valor
1           Cimento CP-II 50kg       Casa do Construtor   R$ 890,00
2           Areia média (5 m³)       Areial São José      R$ 450,00
3           Frete                    Transportes Rocha    R$ 150,00
TOTAL                                                     R$ 1.490,00
`, (r) => {
  check('Print Excel', 'value', r.value, 1490);
  check('Print Excel', 'type', r.type, 'saida');
});

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log('\n==========================================');
console.log(`Total de asserções: ${passed + failed} | Passaram: ${passed} | Falharam: ${failed}`);
if (failures.length > 0) {
  console.log('\nFALHAS:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('Todos os testes do parser passaram.');
}
