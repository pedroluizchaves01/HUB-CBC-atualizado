// src/lib/server/notificationService.ts
//
// Gera notificações internas sempre que um admin ou o marketing cria, atualiza ou exclui
// um registro através do endpoint genérico de dados (/api/data/:collection/:id). Cada um
// dos outros administradores recebe uma notificação; o próprio autor nunca recebe a dele.
//
// Ações de clientes NÃO geram notificação (fora do escopo combinado). Coleções internas/
// sensíveis (usuários, configurações, a própria tabela de notificações) são ignoradas para
// não gerar ruído nem loops.

import * as dataService from "./dataService";

const EXCLUDED_COLLECTIONS = new Set([
  "users", "settings", "demand_settings", "demand_templates", "notifications", "system_status",
]);

const COLLECTION_LABELS: Record<string, string> = {
  clients: "cliente",
  projects: "obra/projeto",
  transactions: "lançamento financeiro",
  documents: "documento",
  contracts: "contrato",
  materials: "material",
  daily_logs: "diário de obra",
  timeline_phases: "fase de cronograma",
  punch_lists: "item de punch list",
  weekly_logs: "relatório semanal",
  regulatory_steps: "etapa regulatória",
  office_transactions: "financeiro do escritório",
  office_leads: "lead",
  labor_contracts: "contrato de mão de obra",
  labor_payments: "pagamento de mão de obra",
  marketing_outbound: "ação de marketing",
  marketing_posts: "postagem",
  marketing_press: "imprensa",
  unified_suppliers: "fornecedor",
  unified_materials: "material de cotação",
  quotation_maps: "cotação",
  demands: "demanda",
};

function getEntityLabel(collection: string, data: any): string {
  if (data && typeof data === "object") {
    for (const field of ["name", "title", "description", "weekLabel"]) {
      if (data[field]) return String(data[field]);
    }
    if (data.number) return `Nº ${data.number}`;
  }
  return COLLECTION_LABELS[collection] || collection;
}

interface Actor {
  id: string;
  name: string;
  role: string;
}

/**
 * Registra notificações para os demais admins após uma escrita/exclusão bem-sucedida.
 * Nunca lança — falhas aqui não podem derrubar a resposta da API original.
 */
export async function notifyChange(
  actor: Actor,
  collection: string,
  entityId: string,
  action: "create" | "update" | "delete",
  data: any
): Promise<void> {
  try {
    if (EXCLUDED_COLLECTIONS.has(collection)) return;
    // Só admin e marketing geram notificação (clientes ficam fora do escopo combinado).
    if (actor.role !== "admin" && actor.role !== "marketing") return;

    const users = (await dataService.listCollection("users")) as any[];
    const recipients = users.filter((u) => u.role === "admin" && u.id !== actor.id);

    const label = COLLECTION_LABELS[collection] || collection;
    const entityName = getEntityLabel(collection, data);
    const actionText = action === "create" ? "criou" : action === "delete" ? "excluiu" : "atualizou";
    const summary = `${actor.name} ${actionText} ${label}: ${entityName}`;
    const now = new Date().toISOString();

    // Demandas com responsável: o responsável entra na lista de destinatários mesmo
    // que não seja admin (ex.: papel marketing) e recebe mensagem personalizada
    // ("atribuiu a você"), desde que não seja o próprio autor.
    const assigneeId: string | null =
      collection === "demands" && data && typeof data === "object" && data.assigneeUserId
        ? String(data.assigneeUserId)
        : null;
    if (assigneeId && assigneeId !== actor.id && !recipients.some((r) => r.id === assigneeId)) {
      const assigneeUser = users.find((u) => u.id === assigneeId);
      if (assigneeUser) recipients.push(assigneeUser);
    }
    if (recipients.length === 0) return;

    for (const recipient of recipients) {
      const isAssignee = assigneeId !== null && recipient.id === assigneeId && action !== "delete";
      const personalSummary = isAssignee
        ? `${actor.name} atribuiu a você a demanda: ${entityName}`
        : summary;
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await dataService.setDocById("notifications", id, {
        id,
        recipientUserId: recipient.id,
        actorUserId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action,
        collection,
        entityId,
        // projectId permite que o frontend navegue direto ao item ao clicar na notificação.
        projectId: (data && typeof data === "object" && data.projectId) ? String(data.projectId) : null,
        summary: personalSummary,
        read: false,
        createdAt: now,
      });
    }
  } catch (err: any) {
    console.error("[notifications] Falha ao gerar notificação:", err?.message || err);
  }
}
