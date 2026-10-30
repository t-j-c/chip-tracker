import { useEffect } from 'react';

// Fire-and-forget request so the API Lambda is usually warm before the first real call.
export function warmUpApi() {
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  fetch(`${apiUrl}/api/health`).catch(() => {});
}

export function useApiWarmUp() {
  useEffect(() => {
    warmUpApi();
  }, []);
}
