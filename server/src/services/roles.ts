import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { roles, type Role } from "../db/schema.js";
import { parseJsonArray, toJsonArray } from "../utils/crypto.js";
import {
  ALL_API_KEYS,
  ALL_MENU_KEYS,
  isAdminCapable,
} from "../rbac/permissions.js";

export type RolePublic = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  menuPerms: string[];
  apiPerms: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function publicRole(row: Role): RolePublic {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    menuPerms: parseJsonArray(row.menuPerms),
    apiPerms: parseJsonArray(row.apiPerms),
    isSystem: row.isSystem,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getRoleById(roleId: string | null | undefined) {
  if (!roleId) return null;
  return db.query.roles.findFirst({ where: eq(roles.id, roleId) });
}

export async function getPortalUserRole() {
  return db.query.roles.findFirst({ where: eq(roles.key, "portal_user") });
}

export function roleAllowsAdmin(role: Role | null | undefined): boolean {
  if (!role) return false;
  // Fixed identities: never treat 用户 as admin even if perms were corrupted
  if (role.key === "portal_user") return false;
  if (role.key === "admin") return true;
  return isAdminCapable(parseJsonArray(role.menuPerms));
}

export function sanitizePerms(
  menuPerms: string[],
  apiPerms: string[],
): { menuPerms: string[]; apiPerms: string[] } {
  const menuSet = new Set(ALL_MENU_KEYS);
  const apiSet = new Set(ALL_API_KEYS);
  return {
    menuPerms: [...new Set(menuPerms.filter((k) => menuSet.has(k)))],
    apiPerms: [...new Set(apiPerms.filter((k) => apiSet.has(k)))],
  };
}

export function encodePerms(menuPerms: string[], apiPerms: string[]) {
  const clean = sanitizePerms(menuPerms, apiPerms);
  return {
    menuPerms: toJsonArray(clean.menuPerms),
    apiPerms: toJsonArray(clean.apiPerms),
    clean,
  };
}
