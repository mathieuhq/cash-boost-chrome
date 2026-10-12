import type { Entitlement, MeResponse, StudentCodeSent } from "@super-x/contracts"

import {
  computeEntitlement,
  linkAttempt,
  MAX_CODE_FAILURES,
  normalizeEmail,
  STUDENT_CODE_TTL,
  studentCheckDue,
  switchBrowser,
  trialRequest,
  trustedMember,
} from "../domain"
import { AppError } from "./errors"
import { hashStudentCode, newStudentCode } from "./student-code"
import {
  UpstreamUnavailable,
  type AccessRecord,
  type AccountRecord,
  type AccountRepository,
  type Clock,
  type LearnHouseGateway,
  type Mailer,
  type PurchaseRepository,
  type StudentLinkCodes,
  type TrialRegistry,
} from "./ports"

export interface AccessDeps {
  accounts: AccountRepository
  purchases: PurchaseRepository
  trials: TrialRegistry
  learnhouse: LearnHouseGateway
  codes: StudentLinkCodes
  mailer: Mailer
  clock: Clock
}

/** Account, Entitlement, Trial, StudentLink and ActiveBrowser use cases. */
export class AccessService {
  constructor(private readonly deps: AccessDeps) {}

  async account(userId: string): Promise<AccountRecord> {
    const account = await this.deps.accounts.find(userId)
    if (!account) throw new AppError("unauthorized", 401)
    return account
  }

  /** GET /api/me: the only place LearnHouse is asked (at most daily for members). */
  async me(userId: string): Promise<MeResponse> {
    const now = this.deps.clock.now()
    const account = await this.account(userId)
    const paid = await this.deps.purchases.hasPaid(userId)
    let access = account.access
    let member = trustedMember(access, now)
    // Students don't change an override or a purchase: skip LearnHouse then.
    if (access.override === null && !paid && studentCheckDue(access, now)) {
      ;({ access, member } = await this.recheckStudent(account, now))
    }
    return {
      account: { id: account.id, email: account.email, name: account.name, image: account.image, role: account.role },
      entitlement: computeEntitlement(
        { override: access.override, paid, studentMember: member, trialStartedAt: access.trialStartedAt },
        now
      ),
      studentEmail: access.studentEmail,
      checkedAt: now,
    }
  }

  /** Entitlement from stored facts only (no LearnHouse call): used on every API request. */
  async entitlement(userId: string): Promise<Entitlement> {
    return this.entitlementOf(await this.account(userId))
  }

  private async entitlementOf(account: AccountRecord): Promise<Entitlement> {
    const now = this.deps.clock.now()
    const { access } = account
    return computeEntitlement(
      {
        override: access.override,
        paid: await this.deps.purchases.hasPaid(account.id),
        studentMember: trustedMember(access, now),
        trialStartedAt: access.trialStartedAt,
      },
      now
    )
  }

  private async recheckStudent(account: AccountRecord, now: number): Promise<{ access: AccessRecord; member: boolean }> {
    const email = account.access.studentEmail ?? normalizeEmail(account.email)
    let member: boolean
    try {
      member = await this.deps.learnhouse.isMember(email)
    } catch (error) {
      if (!(error instanceof UpstreamUnavailable)) throw error
      return { access: account.access, member: trustedMember(account.access, now) }
    }
    // A Google email matching a member is linked like an entered one, unless another Account holds it.
    if (member && account.access.studentEmail === null) {
      if (await this.deps.accounts.linkStudent(account.id, email, now)) {
        return { access: { ...account.access, studentEmail: email, studentMember: true, studentCheckedAt: now }, member }
      }
      member = false
    }
    const patch: Partial<AccessRecord> = { studentMember: member, studentCheckedAt: now }
    await this.deps.accounts.updateAccess(account.id, patch)
    return { access: { ...account.access, ...patch }, member }
  }

  /** POST /api/trial/start. Students and buyers keep their access and burn no Trial. */
  async startTrial(userId: string, xUserId: string): Promise<Entitlement> {
    const account = await this.account(userId)
    const current = await this.entitlementOf(account)
    if (current.kind === "student" || current.kind === "paid" || account.access.override === "revoke") return current

    const request = trialRequest(account.access, xUserId)
    if (request === "same") return current
    if (request === "used") throw new AppError("trial_used", 409)

    const owner = await this.deps.trials.claim(xUserId, userId, this.deps.clock.now())
    if (owner.userId !== userId) throw new AppError("trial_used", 409, "x_account_used")
    if (!(await this.deps.accounts.startTrial(userId, xUserId, owner.startedAt))) {
      // A concurrent request started a Trial first.
      const again = await this.account(userId)
      if (trialRequest(again.access, xUserId) !== "same") throw new AppError("trial_used", 409)
      return this.entitlementOf(again)
    }
    return this.entitlement(userId)
  }

  /**
   * POST /api/student/link: emails a code to a Growth Boost purchase email (ADR 0008). Once linked, the
   * email stays locked to this Account (only an admin can unlink it): a purchase serves one Account.
   */
  async requestStudentCode(userId: string, rawEmail: string): Promise<StudentCodeSent> {
    const account = await this.account(userId)
    if (account.access.studentEmail !== null) throw new AppError("student_already_linked", 409)
    const email = normalizeEmail(rawEmail)

    const now = this.deps.clock.now()
    const attempts = linkAttempt(account.access.studentLinkAttempts, now)
    if (!attempts) throw new AppError("student_link_limit", 429)
    await this.deps.accounts.updateAccess(userId, { studentLinkAttempts: attempts })

    if (!(await upstream(() => this.deps.learnhouse.isMember(email)))) throw new AppError("student_not_found", 404)
    if ((await this.deps.accounts.studentEmailOwner(email)) !== null) throw new AppError("student_email_taken", 409)

    const code = newStudentCode()
    const expiresAt = now + STUDENT_CODE_TTL
    await this.deps.codes.save(userId, { email, codeHash: await hashStudentCode(userId, email, code), expiresAt, failures: 0 })
    try {
      await upstream(() => this.deps.mailer.sendStudentCode(email, code))
    } catch (error) {
      await this.deps.codes.delete(userId)
      throw error
    }
    return { email, expiresAt }
  }

  /** POST /api/student/verify: the emailed code proves the purchase email; it is then locked to this Account. */
  async verifyStudentCode(userId: string, code: string): Promise<MeResponse> {
    await this.account(userId)
    const now = this.deps.clock.now()
    const pending = await this.deps.codes.find(userId)
    if (!pending || now >= pending.expiresAt || pending.failures >= MAX_CODE_FAILURES) {
      throw new AppError("student_code_invalid", 400, "expired")
    }
    if ((await hashStudentCode(userId, pending.email, code)) !== pending.codeHash) {
      if ((await this.deps.codes.fail(userId)) >= MAX_CODE_FAILURES) await this.deps.codes.delete(userId)
      throw new AppError("student_code_invalid", 400)
    }
    await this.deps.codes.delete(userId)
    // Membership was checked when the code was sent, 15 minutes ago at most.
    if (!(await this.deps.accounts.linkStudent(userId, pending.email, now))) throw new AppError("student_email_taken", 409)
    return this.me(userId)
  }

  /** Sign-in exchange: this browser becomes the ActiveBrowser (last login wins, 3 changes / week). */
  async registerBrowser(userId: string, browserId: string): Promise<void> {
    const account = await this.account(userId)
    const result = switchBrowser(account.access, browserId, this.deps.clock.now())
    if (!result.ok) throw new AppError("browser_change_limit", 429)
    if (result.changed) await this.deps.accounts.updateAccess(userId, result.state)
  }

  /** Every authenticated API request: another browser signed in since → 409. */
  async checkBrowser(userId: string, browserId: string): Promise<void> {
    const account = await this.account(userId)
    if (account.access.activeBrowserId !== browserId) throw new AppError("browser_replaced", 409)
  }
}

async function upstream<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof UpstreamUnavailable) throw new AppError("upstream_unavailable", 502, error.service)
    throw error
  }
}
