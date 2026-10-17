import { subscribeToEvent } from "../events";
import createNotification from "../notification/controllers/create-notification";

type DealAssignedEvent = {
  dealId: string;
  workspaceId: string;
  ownerUserId: string | null;
  previousOwnerUserId: string | null;
  assignedByUserId: string;
  title: string;
};

type DealClosedEvent = {
  dealId: string;
  workspaceId: string;
  ownerUserId: string | null;
  title: string;
  valueCents: number;
  currency: string;
  initiatorId?: string;
};

let initialized = false;

/**
 * Turns CRM events into user notifications. Kept out of the controllers so a
 * failing notification can never roll back the write that caused it.
 */
export function initializeCrmSubscriptions() {
  if (initialized) return;
  initialized = true;

  subscribeToEvent<DealAssignedEvent>("crm.deal.assigned", async (data) => {
    // Telling someone they assigned a deal to themselves is noise.
    if (!data.ownerUserId || data.ownerUserId === data.assignedByUserId) return;

    await createNotification({
      userId: data.ownerUserId,
      type: "crm_deal_assigned",
      title: `Negócio atribuído a você: ${data.title}`,
      content: null,
      resourceId: data.dealId,
      resourceType: "crm_deal",
      eventData: { dealId: data.dealId, workspaceId: data.workspaceId },
    });
  });

  subscribeToEvent<DealClosedEvent>("crm.deal.won", async (data) => {
    // The person who closed it already knows; this is for an owner who did not
    // make the move themselves.
    if (!data.ownerUserId) return;
    if (data.initiatorId?.startsWith(data.ownerUserId)) return;

    await createNotification({
      userId: data.ownerUserId,
      type: "crm_deal_won",
      title: `Negócio ganho: ${data.title}`,
      content: null,
      resourceId: data.dealId,
      resourceType: "crm_deal",
      eventData: {
        dealId: data.dealId,
        workspaceId: data.workspaceId,
        valueCents: data.valueCents,
        currency: data.currency,
      },
    });
  });
}
