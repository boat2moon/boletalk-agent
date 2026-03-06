/**
 * 通用重试工具函数
 *
 * 提供 fetchWithRetry 和 withRetry 用于网络请求和异步操作的重试。
 * 使用指数退避策略，避免短时间内大量重试加重服务压力。
 */

/**
 * 带重试的 fetch 请求
 *
 * 策略：指数退避 + 仅对可重试错误（网络错误、5xx、429）重试
 *
 * @param input - fetch 的第一个参数（URL 或 Request）
 * @param init - fetch 的第二个参数（RequestInit）
 * @param options - 重试配置
 * @returns Response
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: {
    /** 最大重试次数（不含首次请求），默认 2 */
    maxRetries?: number;
    /** 首次重试等待时间(ms)，默认 1000 */
    initialDelayMs?: number;
    /** 哪些 HTTP 状态码需要重试，默认 [429, 500, 502, 503, 504] */
    retryableStatuses?: number[];
  } = {}
): Promise<Response> {
  const {
    maxRetries = 2,
    initialDelayMs = 1000,
    retryableStatuses = [429, 500, 502, 503, 504],
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);

      // 成功 或 不可重试的失败 → 直接返回
      if (res.ok || !retryableStatuses.includes(res.status)) {
        return res;
      }

      // 可重试的 HTTP 错误
      lastError = new Error(`HTTP ${res.status}`);
      console.warn(
        `[fetchWithRetry] HTTP ${res.status}, attempt ${attempt + 1}/${maxRetries + 1}`
      );
    } catch (err) {
      // 网络错误（DNS、连接超时等）→ 可重试
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[fetchWithRetry] Network error: ${lastError.message}, attempt ${attempt + 1}/${maxRetries + 1}`
      );
    }

    // 如果还有重试机会，等待后再试
    if (attempt < maxRetries) {
      const delay = initialDelayMs * 2 ** attempt; // 指数退避: 1s, 2s, 4s...
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError || new Error("fetchWithRetry: all attempts failed");
}

/**
 * 通用异步操作重试包装器
 *
 * @param fn - 要重试的异步函数
 * @param options - 重试配置
 * @returns fn 的返回值
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    /** 判断错误是否可重试，默认全部重试 */
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 2, initialDelayMs = 1000, shouldRetry } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (shouldRetry && !shouldRetry(lastError)) {
        throw lastError; // 不可重试的错误，直接抛出
      }

      console.warn(
        `[withRetry] Error: ${lastError.message}, attempt ${attempt + 1}/${maxRetries + 1}`
      );

      if (attempt < maxRetries) {
        const delay = initialDelayMs * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("withRetry: all attempts failed");
}
