import type { EntitlementKind } from "@super-x/contracts"

import { computeEntitlement, trustedMember, type AccessOverride } from "../domain"
import { AppError } from "./errors"
import type { AccountRepository, Clock, PurchaseRepository, Role } from "./ports"

export interface AdminUserRow {
  id: string
  email: string
  name: string
  role: Role
  status: EntitlementKind
  override: AccessOverride | null
  studentEmail: string | null
  activeBrowserId: string | null
  studentCheckedAt: number | null
  trialStartedAt: number | null
  createdAt: number
}

/** Users list and manual access grants (SPEC "Admin"). */
export class AdminService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly purchases: PurchaseRepository,
    private readonly clock: Clock
  ) {}

  async users(search?: string, limit = 200): Promise<AdminUserRow[]> {
    const accounts = await this.accounts.list({ ...(search ? { search } : {}), limit })
    const paid = await this.purchases.paidUserIds(accounts.map((account) => account.id))
    const now = this.clock.now()
    return accounts.map(({ access, ...account }) => ({
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      status: computeEntitlement(
        {
          override: access.override,
          paid: paid.has(account.id),
          studentMember: trustedMember(access, now),
          trialStartedAt: access.trialStartedAt,
        },
        now
      ).kind,
      override: access.override,
      studentEmail: access.studentEmail,
      activeBrowserId: access.activeBrowserId,
      studentCheckedAt: access.studentCheckedAt,
      trialStartedAt: access.trialStartedAt,
      createdAt: account.createdAt,
    }))
  }

  async setOverride(userId: string, override: AccessOverride | null): Promise<void> {
    await this.exists(userId)
    await this.accounts.updateAccess(userId, { override })
  }

  /** Frees the purchase email (e.g. linked by someone else by mistake) so another Account can link it. */
  async unlinkStudent(userId: string): Promise<void> {
    await this.exists(userId)
    await this.accounts.updateAccess(userId, { studentEmail: null, studentMember: false, studentCheckedAt: null })
  }

  private async exists(userId: string): Promise<void> {
    if (!(await this.accounts.find(userId))) throw new AppError("invalid_request", 404, "unknown_user")
  }
}
