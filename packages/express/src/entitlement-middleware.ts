import type { Request, Response, NextFunction } from "express";
import type { EntitlementManager } from "@openpay/core";

export interface EntitlementMiddlewareOptions {
  /** Extract the authenticated user ID from the request. */
  getUserId: (req: Request) => string;
  /** Extract the resource ID being accessed. Defaults to req.params.resourceId. */
  getResourceId?: (req: Request) => string;
}

/**
 * Rejects requests where the authenticated user has no entitlement for the resource.
 *
 * Example:
 *   app.get("/articles/:resourceId", requireEntitlement(manager, {
 *     getUserId: (req) => req.user.id,
 *   }), handler);
 */
export function requireEntitlement(
  manager: EntitlementManager,
  options: EntitlementMiddlewareOptions
) {
  const getResourceId = options.getResourceId ?? ((req) => req.params["resourceId"] ?? "");

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = options.getUserId(req);
      const resourceId = getResourceId(req);
      const allowed = await manager.check(userId, resourceId);

      if (!allowed) {
        res.status(403).json({ error: "Access denied: no entitlement for this resource" });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
