import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { ChipLogoMark } from './ChipLogo';

interface GameHeaderProps {
  roomCode: string;
  isConnected: boolean;
  undoPending: boolean;
  onRequestUndo: () => void;
  onOpenStandings: () => void;
  onOpenActivity: () => void;
  /** Room creator only: opens the seating-order editor. Admin items are hidden when omitted. */
  onOpenSeatOrder?: () => void;
  /** Room creator only: opens the restart-hand confirmation. */
  onRestartHand?: () => void;
}

const MENU_ITEM = 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-mustard/40 disabled:cursor-not-allowed disabled:text-ink-soft disabled:hover:bg-transparent';

export default function GameHeader({
  roomCode,
  isConnected,
  undoPending,
  onRequestUndo,
  onOpenStandings,
  onOpenActivity,
  onOpenSeatOrder,
  onRestartHand,
}: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { soundOn, hapticsOn, reduceMotion, toggle } = useSettingsStore();

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const runAndClose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  // Close on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-2 bg-ink px-3 pb-2 text-paper"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChipLogoMark size={30} />
        <span className="hidden font-display text-lg leading-none tracking-wide min-[400px]:inline">Deal Me In</span>
      </div>

      <button
        onClick={handleCopyCode}
        className="flex items-center gap-1.5 rounded-lg border-2 border-paper bg-mustard px-2.5 py-1 font-display text-sm tracking-[0.2em] text-ink shadow-[2px_2px_0_0_#F7EBCF] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-mustard"
        aria-label={`Room code ${roomCode}, tap to copy`}
        data-testid="room-code-header"
      >
        {roomCode}
        {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      </button>

      <div className="flex items-center gap-2">
        <span
          role="status"
          aria-label={isConnected ? 'Connected' : 'Reconnecting'}
          className={cn(
            'inline-flex h-4 items-center gap-1 rounded-full border-2 border-paper',
            isConnected ? 'w-4 bg-teal' : 'animate-pulse bg-mustard px-1.5 font-display text-[10px] uppercase leading-none text-ink',
          )}
        >
          {!isConnected && 'Reconnecting…'}
        </span>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="rounded-lg p-1.5 text-paper transition-colors hover:bg-paper/15 focus-visible:outline-mustard"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="overflow-menu-btn"
          >
            <MoreVertical aria-hidden="true" size={22} />
          </button>

          {menuOpen && (
            <div role="menu" className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border-[3px] border-ink bg-card py-1 text-ink shadow-hard-lg">
              <button
                role="menuitem"
                onClick={runAndClose(onRequestUndo)}
                disabled={undoPending}
                className={MENU_ITEM}
                data-testid="menu-request-undo"
              >
                {undoPending ? 'Undo Requested...' : 'Request Undo'}
              </button>
              <button role="menuitem" onClick={runAndClose(onOpenStandings)} className={MENU_ITEM} data-testid="menu-standings">Standings</button>
              <button role="menuitem" onClick={runAndClose(onOpenActivity)} className={MENU_ITEM} data-testid="menu-activity">Activity Log</button>
              <div className="my-1 border-t-2 border-dashed border-ink/30" />
              <button role="menuitemcheckbox" aria-checked={soundOn} onClick={() => toggle('soundOn')} className={MENU_ITEM} data-testid="menu-sound">
                Sound <span className="font-display text-xs uppercase">{soundOn ? 'On' : 'Off'}</span>
              </button>
              <button role="menuitemcheckbox" aria-checked={hapticsOn} onClick={() => toggle('hapticsOn')} className={MENU_ITEM} data-testid="menu-haptics">
                Vibration <span className="font-display text-xs uppercase">{hapticsOn ? 'On' : 'Off'}</span>
              </button>
              <button role="menuitemcheckbox" aria-checked={reduceMotion} onClick={() => toggle('reduceMotion')} className={MENU_ITEM} data-testid="menu-motion">
                Reduce Motion <span className="font-display text-xs uppercase">{reduceMotion ? 'On' : 'Off'}</span>
              </button>
              {(onOpenSeatOrder || onRestartHand) && (
                <>
                  <div className="my-1 border-t-2 border-dashed border-ink/30" />
                  <p className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">Host tools</p>
                </>
              )}
              {onOpenSeatOrder && (
                <button role="menuitem" onClick={runAndClose(onOpenSeatOrder)} className={MENU_ITEM} data-testid="menu-seat-order">Seating Order</button>
              )}
              {onRestartHand && (
                <button role="menuitem" onClick={runAndClose(onRestartHand)} className={MENU_ITEM} data-testid="menu-restart-hand">Restart Hand</button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
