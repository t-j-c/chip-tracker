/** Base WebSocket URL, without the room query string. */
export const wsBaseUrl = (): string => {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) return `${apiUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
};

export const buildWsUrl = (roomCode: string, playerId?: string | null): string => {
  const params = new URLSearchParams({ room: roomCode });
  if (playerId) params.set('playerId', playerId);
  return `${wsBaseUrl()}?${params.toString()}`;
};
