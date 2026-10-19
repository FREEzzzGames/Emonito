/* Centralized network layer: bounded requests, explicit HTTP/JSON errors, safe cancellation. */
export function createApi(requests = new Map()) {
  return async function fetchJson(url, timeout = 14000) {
    const key = String(url);
    const previous = requests.get(key);
    if (previous) previous.abort('superseded');

    const controller = new AbortController();
    requests.set(key, controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort('timeout');
    }, timeout);

    try {
      const response = await fetch(key, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
      }

      try {
        return await response.json();
      } catch (error) {
        throw new Error(`Invalid JSON from ${new URL(key, location.href).hostname}: ${error.message}`);
      }
    } catch (error) {
      if (timedOut) throw new Error(`Request timed out after ${timeout} ms`);
      if (controller.signal.aborted) throw new Error('Request superseded by a newer refresh');
      throw error;
    } finally {
      clearTimeout(timer);
      if (requests.get(key) === controller) requests.delete(key);
    }
  };
}
