import type { getActivities } from "@/fetchers/crm/activity";
import type { getCompanies, getCompany } from "@/fetchers/crm/company";
import type { getContact, getContacts } from "@/fetchers/crm/contact";
import type getDeal from "@/fetchers/crm/deal/get-deal";
import type getDealBoard from "@/fetchers/crm/deal/get-deal-board";
import type getDeals from "@/fetchers/crm/deal/get-deals";
import type getCrmLostReasons from "@/fetchers/crm/pipeline/get-lost-reasons";

/**
 * Shapes come straight from the fetchers so a route change on the API side
 * surfaces as a type error here instead of an undefined at runtime.
 */
export type CrmBoard = Awaited<ReturnType<typeof getDealBoard>>;
export type CrmBoardStage = CrmBoard["stages"][number];
export type CrmBoardDeal = CrmBoardStage["deals"][number];

export type CrmDealDetail = Awaited<ReturnType<typeof getDeal>>;
export type CrmDealListItem = Awaited<
  ReturnType<typeof getDeals>
>["items"][number];
export type CrmLostReason = Awaited<
  ReturnType<typeof getCrmLostReasons>
>[number];

export type CrmActivity = Awaited<
  ReturnType<typeof getActivities>
>["items"][number];

export type CrmContactDetail = Awaited<ReturnType<typeof getContact>>;
export type CrmContactListItem = Awaited<
  ReturnType<typeof getContacts>
>["items"][number];

export type CrmCompanyDetail = Awaited<ReturnType<typeof getCompany>>;
export type CrmCompanyListItem = Awaited<
  ReturnType<typeof getCompanies>
>["items"][number];
