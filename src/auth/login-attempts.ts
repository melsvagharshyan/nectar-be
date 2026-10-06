import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Wrong passwords allowed per email before sign-in is locked. */
export const MAX_FAILURES = 5;
/** Failures older than this are forgotten; also how long a lock lasts. */
export const WINDOW_MS = 15 * 60_000;
/** Expired entries are swept once the map grows past this. */
const SWEEP_AT = 10_000;

interface Entry {
  failures: number;
  resetAt: number;
}

/**
 * Per-account brake on password guessing, complementing the per-IP throttle
 * that rotating IPs get around. Only wrong passwords count, so normal
 * sign-ins never trip it, and unknown emails are counted exactly like real
 * ones so a lock doesn't reveal whether an account exists.
 *
 * In-memory: each app instance counts on its own. Move it to a shared store
 * (e.g. Redis) when running more than one instance.
 */
@Injectable()
export class LoginAttempts {
  private readonly entries = new Map<string, Entry>();

  /** Throws 429 while the email is locked. */
  assertAllowed(email: string) {
    const entry = this.live(email);
    if (!entry || entry.failures < MAX_FAILURES) return;
    const minutes = Math.ceil((entry.resetAt - Date.now()) / 60_000);
    throw new HttpException(
      {
        message: `Слишком много неудачных попыток входа. Попробуйте через ${minutes} мин.`,
        code: 'LOGIN_LOCKED',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  recordFailure(email: string) {
    const now = Date.now();
    const entry = this.live(email) ?? { failures: 0, resetAt: now + WINDOW_MS };
    entry.failures += 1;
    // The lock runs a full window from the failure that triggered it.
    if (entry.failures >= MAX_FAILURES) entry.resetAt = now + WINDOW_MS;
    this.entries.set(email, entry);
    if (this.entries.size > SWEEP_AT) this.sweep(now);
  }

  reset(email: string) {
    this.entries.delete(email);
  }

  private live(email: string): Entry | undefined {
    const entry = this.entries.get(email);
    if (entry && entry.resetAt <= Date.now()) {
      this.entries.delete(email);
      return undefined;
    }
    return entry;
  }

  private sweep(now: number) {
    for (const [email, entry] of this.entries)
      if (entry.resetAt <= now) this.entries.delete(email);
  }
}
