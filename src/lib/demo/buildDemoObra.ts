// src/lib/demo/buildDemoObra.ts
// Gera, de forma 100% determinística, todos os registros da OBRA DEMONSTRATIVA
// (residência de 250 m², ~R$ 1,2 milhão, janeiro/2025 a março/2026) no mesmo formato
// que o HUB usa em cada coleção. Nenhum dado aqui é real.
//
// Todos os ids começam com "demo-", o que permite remover a obra inteira sem tocar nos dados reais.

import {
  CONTRACTS, DEMO_AREA, DEMO_BUDGET, DEMO_DELIVERY, DEMO_END, DEMO_IDS, DEMO_START, DOCUMENTS, shiftEarly, EXPENSES, HOLIDAYS,
  MANAGEMENT_FEE_MONTHLY, MANAGEMENT_SUPPLIER, PHASES, PUNCH_LIST, PURCHASES, REGULATORY, SUPPLIERS,
  type ContractDef, type PhaseDef, type PhaseKey, type PODef,
} from './catalog';
import { ACTIVITIES, ENCARREGADOS, MANAGEMENT_NOTES, WEATHER_BY_MONTH_RAIN } from './texts';
import {
  addDays, brDate, brl, clamp, diffDays, lastDayOfMonth, makeRng, mesAno, monthKey, round2, smoothstep, weekday,
} from './util';

export interface DemoDataset {
  collections: Record<string, any[]>;
  summary: {
    totalSpent: number; budget: number; byCategory: Record<string, number>; byPhase: Record<string, { prev: number; real: number }>;
    counts: Record<string, number>;
  };
  client: { id: string; username: string; name: string };
}

// Nome curto da etapa (para rótulos de semana e textos)
const SHORT: Record<PhaseKey, string> = {
  adm: 'Administração', prel: 'Canteiro e projetos', terra: 'Terraplenagem', fund: 'Fundações', estr: 'Estrutura',
  alv: 'Alvenaria', cob: 'Cobertura', ele: 'Instalações elétricas', hid: 'Instalações hidráulicas', imp: 'Impermeabilização',
  reb: 'Reboco e contrapiso', esq: 'Esquadrias e vidros', ges: 'Gesso e forros', pis: 'Pisos e revestimentos',
  pin: 'Pintura', mar: 'Marcenaria e louças', esp: 'Instalações especiais', ext: 'Área externa e piscina', ent: 'Entrega da obra',
};

// Equipe média em obra por etapa (para o diário de obra)
const CREW: Record<PhaseKey, number> = {
  adm: 0, prel: 5, terra: 4, fund: 10, estr: 18, alv: 12, cob: 8, ele: 6, hid: 5, imp: 4, reb: 14, esq: 6,
  ges: 7, pis: 10, pin: 9, mar: 8, esp: 6, ext: 9, ent: 5,
};

const CLIENT_NAME = 'Rodrigo Albuquerque Menezes';

// Imagens ilustrativas por etapa (geradas em public/demo-obra)
export const STAGE_IMAGES: Record<string, [string, string]> = {
  canteiro: ['canteiro-1', 'canteiro-2'],
  terraplenagem: ['terraplenagem-1', 'terraplenagem-2'],
  fundacao: ['fundacao-1', 'fundacao-2'],
  estrutura: ['estrutura-1', 'estrutura-2'],
  alvenaria: ['alvenaria-1', 'alvenaria-2'],
  cobertura: ['cobertura-1', 'cobertura-2'],
  instalacoes: ['instalacoes-1', 'instalacoes-2'],
  reboco: ['reboco-1', 'reboco-2'],
  esquadrias: ['esquadrias-1', 'esquadrias-2'],
  gesso: ['gesso-1', 'gesso-2'],
  pisos: ['pisos-1', 'pisos-2'],
  pintura: ['pintura-1', 'pintura-2'],
  marcenaria: ['marcenaria-1', 'marcenaria-2'],
  externa: ['externa-1', 'externa-2'],
  entrega: ['entrega-1', 'entrega-2'],
};

export function buildDemoObra(): DemoDataset {
  const PID = DEMO_IDS.project;
  const phaseId = (k: PhaseKey) => `demo-ph-${k}`;
  const phaseDef = (k: PhaseKey) => PHASES.find(p => p.key === k)!;

  // -------------------------------------------------------------------------
  // 1) Calendário: feriados e dias de chuva (dias improdutivos)
  // -------------------------------------------------------------------------
  const rng = makeRng(20250106);
  type DayKind = 'ok' | 'rain' | 'heavy' | 'holiday';
  const weekdays: string[] = [];
  for (let d = DEMO_START; d <= DEMO_DELIVERY; d = addDays(d, 1)) {
    const w = weekday(d);
    if (w >= 1 && w <= 5) weekdays.push(d);
  }
  const dayKind: Record<string, DayKind> = {};
  for (const d of weekdays) {
    if (HOLIDAYS[d]) { dayKind[d] = 'holiday'; continue; }
    const m = Number(d.slice(5, 7));
    const p = WEATHER_BY_MONTH_RAIN[m] ?? 0.1;
    const r = rng.next();
    dayKind[d] = d === DEMO_DELIVERY ? 'ok' : r < p * 0.42 ? 'heavy' : r < p ? 'rain' : 'ok';
  }
  const isHoliday = (d: string) => !!HOLIDAYS[d];
  const isWorkday = (d: string) => { const w = weekday(d); return w >= 1 && w <= 5 && !isHoliday(d); };
  const workdayOnOrAfter = (d: string) => { let x = d; while (!isWorkday(x)) x = addDays(x, 1); return x; };
  const workdayOnOrBefore = (d: string) => { let x = d; while (!isWorkday(x)) x = addDays(x, -1); return x; };
  const capEnd = (d: string) => (d > DEMO_END ? workdayOnOrBefore(DEMO_END) : d);
  const payDay = (d: string) => capEnd(workdayOnOrAfter(d));
  const isProductive = (d: string) => dayKind[d] === 'ok' || dayKind[d] === 'rain';

  // -------------------------------------------------------------------------
  // 2) Modelo de progresso (por dias produtivos): usado nos relatórios e diários
  // -------------------------------------------------------------------------
  const prodCountCache: Record<string, number[]> = {};
  const prodCum = (k: PhaseKey): { days: string[]; cum: number[] } => {
    const ph = phaseDef(k);
    const days: string[] = [];
    const cum: number[] = [];
    let c = 0;
    for (let d = ph.actStart; d <= ph.actEnd; d = addDays(d, 1)) {
      const prod = k === 'adm' ? weekday(d) >= 1 && weekday(d) <= 5 : isProductive(d);
      if (prod) c += 1;
      days.push(d); cum.push(c);
    }
    prodCountCache[k] = cum;
    return { days, cum };
  };
  const cumData: Record<string, { days: string[]; cum: number[] }> = {};
  for (const ph of PHASES) cumData[ph.key] = prodCum(ph.key);

  /** Progresso (0–100, inteiro) de uma etapa em determinada data. */
  const progressAt = (k: PhaseKey, date: string): number => {
    const ph = phaseDef(k);
    if (date < ph.actStart) return 0;
    if (date >= ph.actEnd) return 100;
    const { cum } = cumData[k];
    const idx = diffDays(ph.actStart, date);
    const total = cum[cum.length - 1] || 1;
    const f = clamp((cum[idx] ?? 0) / total, 0, 1);
    // curva "S" suavizada, com leve avanço inicial
    const p = 0.55 * smoothstep(f) + 0.45 * f;
    return clamp(Math.round(p * 100), 1, 99);
  };

  // -------------------------------------------------------------------------
  // 3) Mão de obra: contratos de empreiteiros e pagamentos por medição
  // -------------------------------------------------------------------------
  type Tx = {
    id: string; projectId: string; description: string; category: string; value: number; date: string;
    supplier: string; status: 'pago'; notes?: string; invoiceNumber?: string; receiptName?: string; _phase: PhaseKey;
  };
  const txs: Tx[] = [];
  const invoiceRng = makeRng(4242);
  let nfSeq = 1180;
  const nextNf = (prefix: string) => { nfSeq += invoiceRng.int(7, 38); return `${prefix} ${String(nfSeq).padStart(5, '0')}`; };

  const laborContracts: any[] = [];
  const laborPayments: any[] = [];

  for (const c of CONTRACTS) {
    const ph = phaseDef(c.phase);
    const [ws, we] = c.win ? [shiftEarly(c.win[0]), shiftEarly(c.win[1])] : [ph.actStart, ph.actEnd];
    const contractId = `demo-lc-${c.key}`;
    const total = round2(c.value + (c.aditivo?.value ?? 0));
    laborContracts.push({
      id: contractId, projectId: PID, supplier: c.supplier, scope: c.scope, contractValue: total,
      notes: c.notes + (c.aditivo ? ` | ${c.aditivo.label}: + ${brl(c.aditivo.value)}.` : ''),
    });

    const pushPayment = (date: string, value: number, label: string, idx: number) => {
      const d = payDay(date);
      const pid = `demo-lp-${c.key}-${idx}`;
      const nf = c.key === 'adm' ? 'Recibo' : nextNf('NFS-e');
      laborPayments.push({
        id: pid, projectId: PID, contractId, supplier: c.supplier, paymentDate: d, value: round2(value),
        description: label, notes: c.key === 'adm' ? 'Pagamento via Pix.' : `${nf} — pago por transferência bancária.`,
      });
      txs.push({
        id: '', projectId: PID, description: `${c.supplier.split(' — ')[0]} — ${label}`,
        category: c.category ?? 'mao_de_obra', value: round2(value), date: d, supplier: c.supplier, status: 'pago',
        notes: `Contrato: ${c.scope.slice(0, 90)}${c.scope.length > 90 ? '…' : ''}`, invoiceNumber: nf, _phase: c.phase,
      });
    };

    if (c.key === 'adm') {
      // Folha mensal do mestre de obras e equipe de apoio (último dia útil de cada mês)
      const months: string[] = [];
      for (let ym = DEMO_START.slice(0, 7); ym <= DEMO_END.slice(0, 7);) {
        months.push(ym);
        const [y, m] = ym.split('-').map(Number);
        ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      }
      const each = round2(c.value / months.length);
      let acc = 0;
      months.forEach((ym, i) => {
        const v = i === months.length - 1 ? round2(c.value - acc) : each;
        acc = round2(acc + v);
        pushPayment(workdayOnOrBefore(lastDayOfMonth(ym)), v, `Folha de ${mesAno(ym)} — mestre de obras e equipe de apoio`, i + 1);
      });
      continue;
    }

    const span = diffDays(ws, we);
    const dateFor = (at: 'sinal' | 'fim' | number) =>
      at === 'sinal' ? ws : at === 'fim' ? addDays(we, 4) : addDays(ws, Math.round((at / 100) * span) + 4);

    let acc = 0;
    c.pay.forEach((st, i) => {
      const v = i === c.pay.length - 1 ? round2(c.value - acc) : round2((c.value * st.pct) / 100);
      acc = round2(acc + v);
      pushPayment(dateFor(st.at), v, st.label, i + 1);
    });
    if (c.aditivo) pushPayment(dateFor(c.aditivo.at), c.aditivo.value, c.aditivo.label.split(' — ')[0] + ' (pagamento)', 90);
  }

  // Honorários de gerenciamento (um por mês, pagos 2 dias úteis após o fechamento da medição)
  {
    let n = 0;
    for (let ym = DEMO_START.slice(0, 7); ym <= DEMO_END.slice(0, 7);) {
      n += 1;
      const close = workdayOnOrBefore(lastDayOfMonth(ym));
      const pay = payDay(addDays(close, 2));
      txs.push({
        id: '', projectId: PID, description: `Honorários de gerenciamento de obra — medição nº ${String(n).padStart(2, '0')} (${mesAno(ym)})`,
        category: 'outros', value: MANAGEMENT_FEE_MONTHLY, date: pay, supplier: MANAGEMENT_SUPPLIER, status: 'pago',
        notes: 'Honorários mensais conforme contrato de gerenciamento de obra.', invoiceNumber: nextNf('NFS-e'), _phase: 'adm',
      });
      const [y, m] = ym.split('-').map(Number);
      ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
  }

  // Despesas diversas (taxas, projetos complementares, locações, caçambas)
  for (const e of EXPENSES) {
    const d = payDay(e.date <= '2026-02-28' ? shiftEarly(e.date) : e.date);
    txs.push({
      id: '', projectId: PID, description: e.description, category: e.cat, value: e.value, date: d, supplier: e.supplier,
      status: 'pago', notes: e.notes, invoiceNumber: e.invoice, _phase: e.phase,
    });
  }

  // -------------------------------------------------------------------------
  // 4) Compras de materiais, lista de materiais e mapas de cotação
  // -------------------------------------------------------------------------
  const materials: any[] = [];
  const quotationMaps: any[] = [];
  const qrng = makeRng(777);
  const qmOrder = PURCHASES.filter(p => p.map).slice().sort((a, b) => a.date.localeCompare(b.date));
  const supplierInfo = (name: string) => SUPPLIERS[name] ?? { phone: '(67) 3300-0000', email: 'contato@fornecedor.example', terms: 'Boleto 28 dias', fee: 0, time: '3 dias úteis' };

  for (const po of PURCHASES) {
    const info = supplierInfo(po.supplier);
    const order = workdayOnOrAfter(shiftEarly(po.date));
    const delivery = workdayOnOrAfter(addDays(order, po.lead));
    const freight = po.freight ?? (po.lead > 0 ? info.fee : 0);
    const itemsTotal = round2(po.items.reduce((s, [, , q, p]) => s + q * p, 0));
    const total = round2(itemsTotal + freight);
    const payDate = payDay(addDays(delivery, po.pay ?? 28));
    const nf = nextNf('NF-e');

    // itens da lista de materiais
    po.items.forEach(([name, unit, qty, unitPrice], i) => {
      materials.push({
        id: `demo-mat-${po.key}-${i + 1}`, projectId: PID, name, quantity: `${String(qty).replace('.', ',')} ${unit}`, unit,
        unitValue: unitPrice, supplier: po.supplier, estimatedValue: round2(qty * unitPrice), orderDate: order,
        deliveryDate: delivery, status: 'entregue',
        notes: `${po.title}${po.map ? ` • Mapa de cotação nº ${qmOrder.findIndex(x => x.key === po.key) + 1}` : ''} • ${nf}`,
      });
    });
    if (freight > 0) {
      materials.push({
        id: `demo-mat-${po.key}-frete`, projectId: PID, name: 'Frete / entrega no canteiro', quantity: '1 un', unit: 'un',
        unitValue: freight, supplier: po.supplier, estimatedValue: freight, orderDate: order, deliveryDate: delivery,
        status: 'entregue', notes: `Frete do pedido: ${po.title}`,
      });
    }

    const mapNumber = po.map ? qmOrder.findIndex(x => x.key === po.key) + 1 : 0;
    txs.push({
      id: '', projectId: PID, description: `${po.title} — ${po.supplier}`, category: po.cat, value: total, date: payDate,
      supplier: po.supplier, status: 'pago',
      notes: `Pedido em ${brDate(order)} • entregue em ${brDate(delivery)} • condição: ${info.terms}${mapNumber ? ` • Mapa de cotação nº ${mapNumber}` : ''}`,
      invoiceNumber: nf, _phase: po.phase,
    });

    // mapa de cotação (3 fornecedores, o escolhido é o menor preço global)
    if (po.map) {
      const mapId = `demo-qm-${po.key}`;
      const quoteDate = workdayOnOrBefore(addDays(order, -9));
      const authDate = workdayOnOrBefore(addDays(order, -3));
      const factors = po.map.factors ?? [1.05, 1.08];
      const names = [po.supplier, po.map.rivals[0], po.map.rivals[1]];
      const mult = [1, factors[0], factors[1]];
      const items = po.items.map(([name, unit, qty], i) => ({ id: `${mapId}-i${i + 1}`, name, unit, quantity: qty }));
      const sups = names.map((n, si) => {
        const inf = supplierInfo(n);
        const prices: Record<string, number> = {};
        po.items.forEach(([, , , price], i) => {
          const jitter = si === 0 ? 1 : 1 + (qrng.next() - 0.5) * 0.03;
          prices[items[i].id] = round2(price * mult[si] * jitter);
        });
        return {
          id: `${mapId}-s${si + 1}`, name: n, phone: inf.phone, email: inf.email, paymentTerms: inf.terms,
          deliveryFee: si === 0 ? freight : inf.fee, deliveryTime: inf.time, itemPrices: prices,
        };
      });
      // garante que o fornecedor escolhido tenha o menor total (preços + frete)
      const tot = (s: any) => items.reduce((acc, it) => acc + it.quantity * (s.itemPrices[it.id] || 0), 0) + s.deliveryFee;
      for (let si = 1; si < sups.length; si++) {
        while (tot(sups[si]) <= tot(sups[0]) + 1) {
          for (const k of Object.keys(sups[si].itemPrices)) sups[si].itemPrices[k] = round2(sups[si].itemPrices[k] * 1.01);
        }
      }
      // embaralha a ordem de exibição de forma determinística
      const rot = mapNumber % 3;
      const ordered = [...sups.slice(rot), ...sups.slice(0, rot)];
      quotationMaps.push({
        id: mapId, projectId: PID, number: mapNumber, title: po.title, date: quoteDate, status: 'pago',
        items, suppliers: ordered, selectedSupplierId: sups[0].id,
        authorizedAt: brDate(authDate), authorizedBy: CLIENT_NAME.split(' ').slice(0, 2).join(' '),
        observations: po.map.why ?? '', invoiceNumber: nf,
        invoiceScannedData: { supplier: po.supplier, value: total, date: payDate, category: po.cat, description: po.title },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5) Ordena e numera as transações; soma por etapa e categoria
  // -------------------------------------------------------------------------
  txs.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
  txs.forEach((t, i) => { t.id = `demo-tx-${String(i + 1).padStart(3, '0')}`; });
  // lança os comprovantes simulados (nome do arquivo) para o extrato
  txs.forEach(t => { t.receiptName = `comprovante_${t.date}_${t.id.slice(-3)}.pdf`; });

  const byCategory: Record<string, number> = {};
  const realByPhase: Record<string, number> = {};
  for (const t of txs) {
    byCategory[t.category] = round2((byCategory[t.category] ?? 0) + t.value);
    realByPhase[t._phase] = round2((realByPhase[t._phase] ?? 0) + t.value);
  }
  const totalSpent = round2(txs.reduce((s, t) => s + t.value, 0));

  // -------------------------------------------------------------------------
  // 6) Cronograma: custo previsto por etapa (orçamento = R$ 1,2 mi)
  // -------------------------------------------------------------------------
  const prevByPhase: Record<string, number> = {};
  for (const ph of PHASES) prevByPhase[ph.key] = Math.round((realByPhase[ph.key] ?? 0) / ph.overrun / 1000) * 1000;
  {
    const sum = Object.values(prevByPhase).reduce((a, b) => a + b, 0);
    prevByPhase['estr'] += DEMO_BUDGET - sum; // fecha o orçamento exatamente em R$ 1.200.000
  }

  const buildMonthly = (start: string, end: string): Record<string, number> => {
    const total = Math.max(1, diffDays(start, end) + 1);
    const out: Record<string, number> = {};
    let prev = 0;
    for (let ym = start.slice(0, 7); ym <= end.slice(0, 7);) {
      const mEnd = lastDayOfMonth(ym) < end ? lastDayOfMonth(ym) : end;
      const cum = smoothstep((diffDays(start, mEnd) + 1) / total) * 100;
      out[ym] = Math.round((cum - prev) * 10) / 10;
      prev = cum;
      const [y, m] = ym.split('-').map(Number);
      ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    const keys = Object.keys(out);
    const diff = Math.round((100 - keys.reduce((s, k) => s + out[k], 0)) * 10) / 10;
    if (keys.length && Math.abs(diff) >= 0.1) out[keys[keys.length - 1]] = Math.round((out[keys[keys.length - 1]] + diff) * 10) / 10;
    return out;
  };

  const timelinePhases = PHASES.map((ph, i) => ({
    id: phaseId(ph.key), projectId: PID, name: ph.name, startDate: ph.planStart, endDate: ph.planEnd, progress: 100,
    costPrev: prevByPhase[ph.key], costReal: round2(realByPhase[ph.key] ?? 0), order: i,
    monthlyProgress: buildMonthly(ph.planStart, ph.planEnd),
    actualStartDate: ph.actStart, actualEndDate: ph.actEnd,
  }));

  // -------------------------------------------------------------------------
  // 7) Diário de obra e dias improdutivos
  // -------------------------------------------------------------------------
  const weightOf = (k: PhaseKey) => prevByPhase[k] ?? 0;
  const activePhasesAt = (d: string): PhaseDef[] =>
    PHASES.filter(p => p.key !== 'adm' && d >= p.actStart && d <= p.actEnd).sort((a, b) => weightOf(b.key) - weightOf(a.key));
  const stageOf = (k: PhaseKey, d: string): 'ini' | 'meio' | 'fim' => {
    const p = progressAt(k, d);
    return p < 22 ? 'ini' : p < 78 ? 'meio' : 'fim';
  };

  const dailyLogs: any[] = [];
  const unproductive: any[] = [];
  const drng = makeRng(99);
  let dayIdx = 0;
  for (const d of weekdays) {
    dayIdx += 1;
    const kind = dayKind[d];
    if (kind === 'holiday') {
      unproductive.push({ id: `demo-ud-${d}`, projectId: PID, date: d, reason: `Feriado — ${HOLIDAYS[d]}`, createdBy: 'Eng. Chaves', createdAt: `${d}T07:30:00.000Z` });
      continue;
    }
    const active = activePhasesAt(d);
    const crewBase = Math.min(30, 3 + active.reduce((s, p) => s + CREW[p.key], 0));
    let weather = 'Ensolarado';
    let workforce = crewBase + drng.int(-1, 1);
    let desc = '';
    const main = active.slice(0, 3);
    const lines = main.map((p, i) => {
      const pool = ACTIVITIES[p.key][stageOf(p.key, d)];
      return pool[(dayIdx + i * 3) % pool.length];
    });

    if (kind === 'heavy') {
      weather = 'Chuva forte';
      workforce = 2;
      desc = `Obra paralisada por chuva forte durante o dia; frentes externas e concretagens suspensas por segurança. Equipe mínima manteve a proteção de materiais, o bombeamento de água acumulada e a limpeza do canteiro.`;
      unproductive.push({ id: `demo-ud-${d}`, projectId: PID, date: d, reason: 'Chuva forte — frentes externas paralisadas', createdBy: 'Eng. Chaves', createdAt: `${d}T08:00:00.000Z` });
    } else if (kind === 'rain') {
      weather = 'Chuvoso';
      workforce = Math.max(3, Math.round(crewBase * 0.65));
      desc = `Chuva intermitente; priorizados os serviços internos. ${lines.slice(0, 2).map(l => l + '.').join(' ')}`;
    } else {
      const m = Number(d.slice(5, 7));
      weather = drng.pick(m >= 10 || m <= 3 ? ['Ensolarado', 'Parcialmente nublado', 'Nublado', 'Ensolarado'] : ['Ensolarado', 'Ensolarado', 'Parcialmente nublado']);
      desc = lines.map(l => l + '.').join(' ') || 'Rotina de obra: conferência de materiais, limpeza e organização do canteiro.';
    }
    dailyLogs.push({
      id: `demo-dl-${d}`, projectId: PID, date: d, weather, workforce: Math.max(2, workforce), description: desc,
      loggedBy: ENCARREGADOS[(dayIdx + (active[0] ? CREW[active[0].key] : 0)) % ENCARREGADOS.length],
    });
  }
  // Entrega: sem dias improdutivos adicionais no último dia

  // -------------------------------------------------------------------------
  // 8) Avanço físico semana a semana (relatórios semanais com fotos)
  // -------------------------------------------------------------------------
  const weeklyLogs: any[] = [];
  const logDates: string[] = [];
  for (let d = addDays(DEMO_START, 4); d <= DEMO_DELIVERY; d = addDays(d, 7)) logDates.push(d);
  if (logDates[logDates.length - 1] !== DEMO_DELIVERY) logDates.push(DEMO_DELIVERY);

  const deliveriesByWeek = (from: string, to: string) =>
    PURCHASES.map(po => ({ po, delivery: workdayOnOrAfter(addDays(workdayOnOrAfter(shiftEarly(po.date)), po.lead)) }))
      .filter(x => x.delivery >= from && x.delivery <= to && x.po.cat !== 'outros')
      .sort((a, b) => weightOfPO(b.po) - weightOfPO(a.po));
  function weightOfPO(po: PODef) { return po.items.reduce((s, [, , q, p]) => s + q * p, 0); }
  function poLabel(po: PODef) {
    const t = po.title.replace(/^Compra avulsa: /, 'compra avulsa — ').replace(/^Canteiro: /, 'material de canteiro — ');
    return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }

  const wrng = makeRng(31337);
  logDates.forEach((date, i) => {
    const from = addDays(date, i === 0 ? -4 : -6 < 0 ? -6 : -6);
    const weekStart = i === 0 ? DEMO_START : addDays(date, -4);
    const prevDate = i === 0 ? addDays(DEMO_START, -1) : logDates[i - 1];
    const isFinal = date === DEMO_DELIVERY;
    const progressions: Record<string, number> = {};
    for (const ph of PHASES) progressions[phaseId(ph.key)] = progressAt(ph.key, date);

    const moving = PHASES
      .filter(p => p.key !== 'adm')
      .filter(p => progressAt(p.key, date) > progressAt(p.key, prevDate) || (date >= p.actStart && prevDate < p.actStart))
      .sort((a, b) => weightOf(b.key) - weightOf(a.key));
    const focus = moving.slice(0, 3);
    const dominant = focus[0] ?? activePhasesAt(date)[0] ?? PHASES[PHASES.length - 1];

    const sentences: string[] = [];
    focus.forEach((p, k) => {
      const before = progressAt(p.key, prevDate);
      const after = progressAt(p.key, date);
      const st: 'ini' | 'meio' | 'fim' = before === 0 ? 'ini' : after >= 100 ? 'fim' : after < 22 ? 'ini' : after < 78 ? 'meio' : 'fim';
      const pool = ACTIVITIES[p.key][st];
      const act = pool[(i + k) % pool.length];
      const tail = after >= 100 && before < 100 ? ` — etapa concluída (${SHORT[p.key]}: 100%)` : ` (${SHORT[p.key]}: ${after}%)`;
      sentences.push(`${act}${tail}.`);
    });
    if (isFinal) {
      sentences.length = 0;
      sentences.push('Vistoria final de entrega realizada com o cliente, sem pendências impeditivas.');
      sentences.push('Entrega das chaves, do manual do proprietário e das pastas de projetos conforme construído (as-built).');
      sentences.push(`Obra concluída e entregue em ${brDate(DEMO_DELIVERY)}, ${diffDays(DEMO_DELIVERY, DEMO_END)} dias antes do prazo contratual (${brDate(DEMO_END)}). Habite-se e CND serão emitidos ainda em março.`);
    }

    // eventos da semana: entregas, chuva e feriados
    const dl = deliveriesByWeek(weekStart, date).slice(0, 2);
    if (dl.length) sentences.push(`Recebimento no canteiro: ${dl.map(x => `${poLabel(x.po)} (${x.po.supplier})`).join('; ')}.`);
    const weekDays = weekdays.filter(d => d >= weekStart && d <= date);
    const heavy = weekDays.filter(d => dayKind[d] === 'heavy').length;
    const holis = weekDays.filter(d => dayKind[d] === 'holiday');
    if (heavy > 0) sentences.push(`Chuva forte em ${heavy} dia${heavy > 1 ? 's' : ''} da semana paralisou as frentes externas${heavy >= 2 ? ' e comprometeu parte do ritmo previsto' : ''}.`);
    if (holis.length) sentences.push(`Semana com ${holis.length} dia${holis.length > 1 ? 's' : ''} sem expediente (${holis.map(d => HOLIDAYS[d]).filter((v, idx, a) => a.indexOf(v) === idx).join(', ')}).`);
    if (!isFinal && i % 3 === 2) sentences.push(MANAGEMENT_NOTES[(i / 3 | 0) % MANAGEMENT_NOTES.length]);

    const stageKeys = Array.from(new Set(focus.map(p => p.stage)));
    if (stageKeys.length === 0) stageKeys.push(dominant.stage);
    const photos = stageKeys.slice(0, 2).map((sk, pi) => {
      const prog = progressAt(focus[pi]?.key ?? dominant.key, date);
      const [a, b] = STAGE_IMAGES[sk] ?? STAGE_IMAGES['canteiro'];
      const file = prog < 50 ? a : b;
      const label = SHORT[(focus[pi] ?? dominant).key];
      return {
        id: `demo-wp-${String(i + 1).padStart(2, '0')}-${pi + 1}`,
        url: `/demo-obra/${file}.jpg`,
        name: `semana-${String(i + 1).padStart(2, '0')}_${file}.jpg`,
        description: `${label} — registro ilustrativo da semana ${i + 1}`,
      };
    });

    weeklyLogs.push({
      id: `demo-wl-${String(i + 1).padStart(2, '0')}`, projectId: PID, date,
      weekLabel: isFinal ? `Semana ${i + 1} — Entrega da obra` : `Semana ${i + 1} — ${SHORT[dominant.key]}`,
      description: `${brDate(weekStart)} a ${brDate(date)}. ${sentences.join(' ')}`.trim(),
      phaseProgressions: progressions, photos,
    });
    void wrng; void from;
  });

  // -------------------------------------------------------------------------
  // 9) Boletins de medição mensais (liberados ao cliente)
  // -------------------------------------------------------------------------
  const measurements: any[] = [];
  const inP = (d: string, a: string, b: string) => d >= a && d <= b;
  const laborCont = laborContracts;
  const phasesForCalc = timelinePhases;
  const totalWeight = phasesForCalc.reduce((s, p) => s + p.costPrev, 0);
  const progressFromLogs = (pid: string, until: string) => {
    let val = 0;
    for (const l of weeklyLogs.filter(x => x.date <= until)) {
      const p = l.phaseProgressions?.[pid];
      if (typeof p === 'number') val = p;
    }
    return val;
  };
  const wAvg = (getter: (p: any) => number) => phasesForCalc.reduce((s, p) => s + getter(p) * p.costPrev, 0) / totalWeight;

  let mNum = 0;
  for (let ym = DEMO_START.slice(0, 7); ym <= DEMO_END.slice(0, 7);) {
    mNum += 1;
    const periodStart = ym === DEMO_START.slice(0, 7) ? DEMO_START : `${ym}-01`;
    const periodEnd = lastDayOfMonth(ym) > DEMO_END ? DEMO_END : lastDayOfMonth(ym);
    const emission = ym === DEMO_END.slice(0, 7) ? DEMO_END : workdayOnOrAfter(addDays(periodEnd, 5));
    const beforeStart = addDays(periodStart, -1);

    const periodTx = txs.filter(t => inP(t.date, periodStart, periodEnd));
    const spentPeriod = round2(periodTx.reduce((s, t) => s + t.value, 0));
    const spentTotal = round2(txs.filter(t => t.date <= periodEnd).reduce((s, t) => s + t.value, 0));

    const phaseProgress = phasesForCalc.map(p => ({
      name: p.name, progressStart: progressFromLogs(p.id, beforeStart), progressEnd: progressFromLogs(p.id, periodEnd),
    }));
    const physTotal = wAvg(p => phaseProgress.find(x => x.name === p.name)!.progressEnd);
    const physStart = wAvg(p => phaseProgress.find(x => x.name === p.name)!.progressStart);

    const ps = new Date(periodStart + 'T00:00:00').getTime();
    const pe = new Date(periodEnd + 'T23:59:59').getTime();
    let costPlanned = 0; let physPlannedW = 0;
    for (const p of phasesForCalc) {
      const s = new Date(p.startDate + 'T00:00:00').getTime();
      const e = new Date(p.endDate + 'T23:59:59').getTime();
      const totalDays = Math.max(1, Math.round((e - s) / 86400000));
      const os = Math.max(s, ps); const oe = Math.min(e, pe);
      if (os > oe) continue;
      const ratio = Math.min(1, Math.max(0, Math.round((oe - os) / 86400000)) / totalDays);
      costPlanned += p.costPrev * ratio;
      physPlannedW += ratio * 100 * p.costPrev;
    }

    const periodLogs = weeklyLogs.filter(l => inP(l.date, periodStart, periodEnd));
    const photos = periodLogs.flatMap(l => l.photos.map((ph: any) => ({ id: `${ph.id}-m${mNum}`, url: ph.url, caption: ph.description }))).slice(0, 6);
    const unprodList = unproductive.filter(u => inP(u.date, periodStart, periodEnd)).sort((a, b) => a.date.localeCompare(b.date))
      .map(u => ({ date: u.date, reason: u.reason }));

    const topPhases = phasesForCalc
      .map(p => ({ n: p.name, inc: phaseProgress.find(x => x.name === p.name)!.progressEnd - phaseProgress.find(x => x.name === p.name)!.progressStart, w: p.costPrev }))
      .filter(x => x.inc > 0 && !x.n.startsWith('Administração')).sort((a, b) => b.inc * b.w - a.inc * a.w).slice(0, 3).map(x => x.n.split(' (')[0]);
    const physPeriod = Math.max(0, physTotal - physStart);
    const physPlannedPeriod = physPlannedW / totalWeight;
    const summaryText = `Medição nº ${String(mNum).padStart(2, '0')} — ${mesAno(ym)}. No período, a obra avançou ${physPeriod.toFixed(1).replace('.', ',')}% (previsto no cronograma: ${physPlannedPeriod.toFixed(1).replace('.', ',')}%), acumulando ${physTotal.toFixed(1).replace('.', ',')}% de execução física. ` +
      (topPhases.length ? `Principais frentes: ${topPhases.join('; ')}. ` : '') +
      `Desembolso do período de ${brl(spentPeriod)} (${((spentPeriod / DEMO_BUDGET) * 100).toFixed(1).replace('.', ',')}% do orçamento) e acumulado de ${brl(spentTotal)}. ` +
      (unprodList.length ? `Foram registrados ${unprodList.length} dia${unprodList.length > 1 ? 's' : ''} improdutivo${unprodList.length > 1 ? 's' : ''} no período (chuva e feriados).` : 'Sem dias improdutivos no período.');

    measurements.push({
      id: `demo-ms-${String(mNum).padStart(2, '0')}`, projectId: PID, number: String(mNum).padStart(2, '0'), periodStart, periodEnd,
      emissionDate: emission, summaryText, responsibleTechnical: 'Chaves Brites Correa Construtora',
      physicalProgressPeriod: physPeriod, physicalProgressTotal: physTotal,
      financialProgressPeriod: (spentPeriod / DEMO_BUDGET) * 100, financialProgressTotal: (spentTotal / DEMO_BUDGET) * 100,
      spentPeriod, spentTotal, physicalPlannedPeriod: physPlannedPeriod,
      financialPlannedPeriod: (costPlanned / DEMO_BUDGET) * 100, costPlannedPeriod: costPlanned,
      unproductiveDaysPeriod: unprodList, photos, phaseProgress,
      expensesSnapshot: periodTx.map(t => ({ date: t.date, description: t.description, category: ({ materiais: 'Materiais', mao_de_obra: 'Mão de Obra', projetos_complementares: 'Projetos', taxas: 'Taxas', decoracao: 'Decoração', outros: 'Outros' } as any)[t.category] ?? t.category, supplier: t.supplier, value: t.value })),
      laborPaymentsSnapshot: laborPayments.filter(p => inP(p.paymentDate, periodStart, periodEnd)).map(p => {
        const c = laborCont.find(x => x.id === p.contractId);
        return {
          supplier: p.supplier, description: p.description, paymentDate: p.paymentDate, value: p.value,
          contractValue: c?.contractValue ?? 0,
          contractPaidTotal: round2(laborPayments.filter(x => x.contractId === p.contractId && x.paymentDate <= periodEnd).reduce((s, x) => s + x.value, 0)),
        };
      }),
      released: true, createdAt: `${emission}T12:00:00.000Z`,
    });

    const [y, m] = ym.split('-').map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------------------
  // 10) Cliente, obra, documentos, licenças e pendências
  // -------------------------------------------------------------------------
  const client = {
    id: DEMO_IDS.client, name: CLIENT_NAME, email: 'cliente.exemplo@exemplo.example', phone: '(67) 90000-0000',
    username: DEMO_IDS.username, createdAt: '2025-01-03', cpfCnpj: '000.000.000-00',
    address: 'Rua dos Ipês, 250 — Condomínio Vale dos Ipês, Campo Grande - MS', cep: '79000-000',
    nationality: 'brasileiro', maritalStatus: 'casado(a)', profession: 'empresário',
  };
  const project = {
    id: PID, name: 'Residência Albuquerque (Obra Exemplo)', clientId: DEMO_IDS.client, type: 'obra', status: 'concluido',
    budget: DEMO_BUDGET, startDate: DEMO_START, endDate: DEMO_DELIVERY,
    location: 'Rua dos Ipês, 250 — Condomínio Vale dos Ipês, Campo Grande - MS', area: DEMO_AREA, cep: '79000-000',
    description: 'OBRA DEMONSTRATIVA (dados fictícios): residência unifamiliar de alto padrão com 250 m² em dois pavimentos — 3 suítes, living integrado, cozinha gourmet, escritório, varanda, piscina e paisagismo. Estrutura em concreto armado, cobertura metálica termoacústica, esquadrias de alumínio e marcenaria planejada. Prazo contratado de 15 meses (até 31/03/2026); concluída e entregue em 06/03/2026, 25 dias antes do prazo, com custo final 7% abaixo do orçamento aprovado.',
  };
  const documents = DOCUMENTS.map((d, i) => ({
    id: `demo-doc-${String(i + 1).padStart(2, '0')}`, projectId: PID, name: d.name, description: d.description, class: d.class,
    fileName: d.fileName, uploadedAt: d.date, status: d.status, ...(d.category ? { category: d.category } : {}),
  }));
  const regulatory = REGULATORY.map((r, i) => ({ id: `demo-reg-${String(i + 1).padStart(2, '0')}`, projectId: PID, ...r }));
  const punch = PUNCH_LIST.map((p, i) => ({ id: `demo-pl-${String(i + 1).padStart(2, '0')}`, projectId: PID, task: p.task, priority: p.priority, checked: true }));

  // -------------------------------------------------------------------------
  // 11) Monta as coleções (sem campos internos)
  // -------------------------------------------------------------------------
  const transactions = txs.map(({ _phase, ...t }) => t);
  const byPhase: Record<string, { prev: number; real: number }> = {};
  for (const ph of PHASES) byPhase[ph.key] = { prev: prevByPhase[ph.key], real: round2(realByPhase[ph.key] ?? 0) };

  const collections: Record<string, any[]> = {
    clients: [client], projects: [project], timeline_phases: timelinePhases, weekly_logs: weeklyLogs, daily_logs: dailyLogs,
    unproductive_days: unproductive, materials, quotation_maps: quotationMaps, transactions, labor_contracts: laborContracts,
    labor_payments: laborPayments, measurements, documents, regulatory_steps: regulatory, punch_lists: punch,
  };
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(collections)) counts[k] = v.length;

  return { collections, summary: { totalSpent, budget: DEMO_BUDGET, byCategory, byPhase, counts }, client: { id: client.id, username: client.username, name: client.name } };
}
