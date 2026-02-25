import type { Request, Response, NextFunction } from "express";
import type { SessionUser } from "./auth";

export type OrgRole = "owner" | "admin" | "developer" | "viewer";

/**
 * Require authenticated user and resolve org context. Attaches orgId and role to request.
 * Use after authenticateToken.
 */
export function requireOrgMember(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as SessionUser | undefined;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!user.organizationId || !user.role) {
    res.status(401).json({ error: "Organization context required" });
    return;
  }
  (req as any).orgId = user.organizationId;
  (req as any).orgRole = user.role;
  next();
}

/**
 * Require the user to have one of the given roles in their org (e.g. owner or admin for mutations).
 * Use after requireOrgMember (or after authenticateToken when user is guaranteed to have org+role).
 */
export function requireOrgRole(allowedRoles: OrgRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).orgRole ?? (req.user as SessionUser)?.role;
    if (!role || !allowedRoles.includes(role as OrgRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

/**
 * Whether the given role can manage repos/integrations (create, edit, delete).
 */
export function canManageRepos(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Whether the given role can invite members.
 */
export function canInviteMembers(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}
