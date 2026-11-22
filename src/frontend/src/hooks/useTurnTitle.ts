import { useEffect } from 'react';

const BASE_TITLE = 'Deal Me In';

export function useTurnTitle(isYourTurn: boolean) {
  useEffect(() => {
    document.title = isYourTurn ? `🔔 Your turn! · ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [isYourTurn]);
}
