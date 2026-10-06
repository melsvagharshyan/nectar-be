import { HttpException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginAttempts, MAX_FAILURES, WINDOW_MS } from './login-attempts.js';

const EMAIL = 'someone@example.com';

describe('LoginAttempts', () => {
  let attempts: LoginAttempts;

  const fail = (times: number, email = EMAIL) => {
    for (let i = 0; i < times; i++) attempts.recordFailure(email);
  };
  const lockedFor = (email = EMAIL) => {
    try {
      attempts.assertAllowed(email);
      return null;
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
      return (e as HttpException).getResponse();
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    attempts = new LoginAttempts();
  });
  afterEach(() => vi.useRealTimers());

  it('locks after too many wrong passwords', () => {
    fail(MAX_FAILURES - 1);
    expect(lockedFor()).toBeNull();
    fail(1);
    expect(lockedFor()).toMatchObject({
      code: 'LOGIN_LOCKED',
      message: expect.stringContaining('15 мин'),
    });
  });

  it('only locks the email that failed', () => {
    fail(MAX_FAILURES);
    expect(lockedFor('other@example.com')).toBeNull();
  });

  it('forgets old failures', () => {
    fail(MAX_FAILURES - 1);
    vi.advanceTimersByTime(WINDOW_MS);
    fail(1);
    expect(lockedFor()).toBeNull();
  });

  it('keeps the lock a full window from the failure that triggered it', () => {
    fail(1);
    vi.advanceTimersByTime(WINDOW_MS - 60_000);
    fail(MAX_FAILURES - 1);
    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(lockedFor()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(lockedFor()).toBeNull();
  });

  it('clears the count on a successful sign-in', () => {
    fail(MAX_FAILURES - 1);
    attempts.reset(EMAIL);
    fail(MAX_FAILURES - 1);
    expect(lockedFor()).toBeNull();
  });
});
