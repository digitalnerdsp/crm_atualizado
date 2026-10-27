import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useGetActiveWorkspaceUser } from "@/hooks/queries/workspace-users/use-active-workspace-user";
import { authClient } from "@/lib/auth-client";

export type PermissionLevel = "owner" | "admin" | "member";

// Capabilities are named permission bundles checked against the SERVER via
// better-auth's `/organization/has-permission` endpoint. Going through the
// server is what makes custom workspace roles work in the UI — the local
// `checkRolePermission` only knows about the four static roles compiled
// into the auth client, so it would silently return false for any custom
// role that grants the permission.
const CAPABILITIES = {
  viewHosting: { hosting: ["read"] },
  updateHosting: { hosting: ["update"] },
  notifyHosting: { hosting: ["notify"] },
  portfolioUpdate: { portfolio: ["update"] },
  portfolioNotify: { portfolio: ["notify"] },
  portfolioCosts: { portfolio: ["costs"] },
  portfolioDraft: { portfolio: ["draft"] },
  portfolioApprove: { portfolio: ["approve"] },
  reverseFinance: { finance: ["read", "reverse"] },
  cancelFinance: { finance: ["read", "cancel"] },
  viewFinance: { finance: ["read"] },
  createFinance: { finance: ["read", "create"] },
  updateFinance: { finance: ["read", "update"] },
  settleFinance: { finance: ["read", "settle"] },
  exportFinance: { finance: ["read", "export"] },
  manageFinance: { finance: ["read", "manage"] },
  manageProjects: { project: ["create", "update", "delete"] },
  viewProjects: { project: ["read"] },
  createProjects: { project: ["create"] },
  deleteProjects: { project: ["delete"] },
  manageTasks: { task: ["create", "update", "delete"] },
  createTasks: { task: ["create"] },
  updateTasks: { task: ["update"] },
  assignTasks: { task: ["assign"] },
  manageLabels: { label: ["create", "update", "delete"] },
  viewDashboard: { dashboard: ["read"] },
  viewTemplates: { template: ["read"] },
  useTemplates: { template: ["use"] },
  manageTemplates: { template: ["manage"] },
  viewCalendar: { calendar: ["read"] },
  createCalendar: { calendar: ["create"] },
  updateCalendar: { calendar: ["update"] },
  deleteCalendar: { calendar: ["delete"] },
  viewWorkspace: { workspace: ["read"] },
  manageWorkspace: { workspace: ["update", "manage_settings"] },
  deleteWorkspace: { workspace: ["delete"] },
  inviteUsers: { invitation: ["create"] },
  manageTeam: { member: ["update", "delete"] },
  removeMembers: { member: ["delete"] },
  // CRM. `viewCrm` gates the whole "Comercial" sidebar group; `viewAllDeals`
  // is what separates a seller (own pipeline) from a manager (the team's).
  viewCrm: { crmDeal: ["read"] },
  viewAllDeals: { crmDeal: ["read_all"] },
  createDeals: { crmDeal: ["create"] },
  updateDeals: { crmDeal: ["update"] },
  deleteDeals: { crmDeal: ["delete"] },
  changeDealStage: { crmDeal: ["change_stage"] },
  assignDeals: { crmDeal: ["assign"] },
  viewContacts: { crmContact: ["read"] },
  manageContacts: { crmContact: ["create", "update"] },
  exportContacts: { crmContact: ["export"] },
  viewCompanies: { crmCompany: ["read"] },
  manageCompanies: { crmCompany: ["create", "update"] },
  createCompanies: { crmCompany: ["create"] },
  updateCompanies: { crmCompany: ["update"] },
  notifyCompanies: { crmCompany: ["notify"] },
  managePipelines: { crmPipeline: ["manage"] },
  manageCrmFields: { crmField: ["manage"] },
  viewCrmReports: { crmReport: ["read"] },
  viewAllCrmReports: { crmReport: ["read_all"] },
} as const satisfies Record<string, Record<string, string[]>>;

type Capability = keyof typeof CAPABILITIES;

type CapabilityMap = Record<Capability, boolean>;

function emptyCapabilityMap(): CapabilityMap {
  const out = {} as CapabilityMap;
  for (const key of Object.keys(CAPABILITIES) as Capability[]) {
    out[key] = false;
  }
  return out;
}

export function useWorkspacePermission() {
  const { user } = useAuth();
  const { data: activeWorkspace } = useActiveWorkspace();
  const { data: activeMember } = useGetActiveWorkspaceUser();
  const workspaceId = activeWorkspace?.id;
  const role = activeMember?.role as string | undefined;
  const globalRole = (user as { role?: string } | null)?.role;
  const isInstanceAdmin = globalRole === "admin" || globalRole === "superadmin";

  // One query that fans out to all capability checks in parallel and caches
  // the resulting map by (workspaceId, role). Refetches when either changes
  // — e.g., when the admin edits the role's permissions in the Roles UI and
  // we invalidate this key.
  const {
    data: capabilities,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["workspace-capabilities", workspaceId, role, globalRole ?? null],
    enabled: Boolean(workspaceId && (role || isInstanceAdmin)),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CapabilityMap> => {
      if (isInstanceAdmin) {
        const map = emptyCapabilityMap();
        for (const key of Object.keys(map) as Capability[]) {
          map[key] = true;
        }
        return map;
      }
      const entries = Object.entries(CAPABILITIES) as Array<
        [Capability, Record<string, string[]>]
      >;
      const results = await Promise.all(
        entries.map(async ([key, permissions]) => {
          try {
            const res = await authClient.organization.hasPermission({
              organizationId: workspaceId,
              permissions,
            });
            return [key, res.data?.success === true] as const;
          } catch (error) {
            console.error(`hasPermission check failed for ${key}:`, error);
            return [key, false] as const;
          }
        }),
      );
      const map = emptyCapabilityMap();
      for (const [key, value] of results) {
        map[key] = value;
      }
      return map;
    },
  });

  const can: CapabilityMap = capabilities ?? emptyCapabilityMap();

  const helpers = useMemo(() => {
    return {
      canViewHosting: () => can.viewHosting,
      canUpdateHosting: () => can.updateHosting,
      canNotifyHosting: () => can.notifyHosting,
      canManagePortfolio: () => can.portfolioUpdate,
      canNotifyPortfolio: () => can.portfolioNotify,
      canManageSiteCosts: () => can.portfolioCosts,
      canDraftContracts: () => can.portfolioDraft,
      canApproveDrafts: () => can.portfolioApprove,
      canReverseFinance: () => can.reverseFinance,
      canCancelFinance: () => can.cancelFinance,
      canViewFinance: () => can.viewFinance,
      canCreateFinance: () => can.createFinance,
      canUpdateFinance: () => can.updateFinance,
      canSettleFinance: () => can.settleFinance,
      canExportFinance: () => can.exportFinance,
      canManageFinance: () => can.manageFinance,
      canManageProjects: () => can.manageProjects,
      canViewProjects: () => can.viewProjects,
      canCreateProjects: () => can.createProjects,
      canDeleteProjects: () => can.deleteProjects,
      canManageTasks: () => can.manageTasks,
      canCreateTasks: () => can.createTasks,
      canUpdateTasks: () => can.updateTasks,
      canAssignTasks: () => can.assignTasks,
      canManageLabels: () => can.manageLabels,
      canViewDashboard: () => can.viewDashboard,
      canViewTemplates: () => can.viewTemplates,
      canUseTemplates: () => can.useTemplates,
      canManageTemplates: () => can.manageTemplates,
      canViewCalendar: () => can.viewCalendar,
      canCreateCalendar: () => can.createCalendar,
      canUpdateCalendar: () => can.updateCalendar,
      canDeleteCalendar: () => can.deleteCalendar,
      canViewWorkspace: () => can.viewWorkspace,
      canManageWorkspace: () => can.manageWorkspace,
      canDeleteWorkspace: () => can.deleteWorkspace,
      canInviteUsers: () => can.inviteUsers,
      canManageTeam: () => can.manageTeam,
      canRemoveMembers: () => can.removeMembers,
      canViewCrm: () => can.viewCrm,
      canViewAllDeals: () => can.viewAllDeals,
      canCreateDeals: () => can.createDeals,
      canUpdateDeals: () => can.updateDeals,
      canDeleteDeals: () => can.deleteDeals,
      canChangeDealStage: () => can.changeDealStage,
      canAssignDeals: () => can.assignDeals,
      canViewContacts: () => can.viewContacts,
      canManageContacts: () => can.manageContacts,
      canExportContacts: () => can.exportContacts,
      canViewCompanies: () => can.viewCompanies,
      canManageCompanies: () => can.manageCompanies,
      canCreateCompanies: () => can.createCompanies,
      canUpdateCompanies: () => can.updateCompanies,
      canNotifyCompanies: () => can.notifyCompanies,
      canManagePipelines: () => can.managePipelines,
      canManageCrmFields: () => can.manageCrmFields,
      canViewCrmReports: () => can.viewCrmReports,
      canViewAllCrmReports: () => can.viewAllCrmReports,
      // Escape hatch for ad-hoc permission checks (uncached). Prefer adding
      // a capability above.
      hasPermission: async (permissions: Record<string, string[]>) => {
        try {
          const res = await authClient.organization.hasPermission({
            organizationId: workspaceId,
            permissions,
          });
          return res.data?.success === true;
        } catch (error) {
          console.error("hasPermission check failed:", error);
          return false;
        }
      },
    };
  }, [can, workspaceId]);

  return {
    ...helpers,
    workspace: activeWorkspace,
    member: activeMember,
    role,
    isOwner: role === "owner",
    isAdmin: isInstanceAdmin || role === "owner" || role === "admin",
    // True while the first capability fetch is in flight. Useful for hiding
    // action UI during the initial render instead of flashing it on then
    // off when the server check resolves.
    isCheckingPermissions:
      Boolean(workspaceId && (role || isInstanceAdmin)) &&
      (isLoading || !capabilities),
    isRefetchingPermissions: isFetching,
  };
}
