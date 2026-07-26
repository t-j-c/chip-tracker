import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameHeaderProps {
  roomCode: string;
  isConnected: boolean;
  undoPending: boolean;
  onRequestUndo: () => void;
}

export default function GameHeader({
  roomCode,
  isConnected,
  undoPending,
  onRequestUndo,
}: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleRequestUndo = () => {
    setMenuOpen(false);
    onRequestUndo();
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-surface-card border-b border-surface-elevated flex-shrink-0">
      {/* Brand */}
      <span className="text-sm font-bold text-text-primary">Chip Tracker</span>

      {/* Center: room code + undo pending */}
      <div className="flex items-center gap-2">
        {undoPending && (
          <span
            className="text-xs text-accent-warning font-semibold animate-pulse"
            data-testid="undo-pending"
          >
            Undo Requested...
          </span>
        )}
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-elevated text-text-secondary text-xs font-mono hover:text-text-primary transition-colors"
          aria-label={`Room code ${roomCode}, tap to copy`}
          data-testid="room-code-header"
        >
          {roomCode}
          {copied ? (
            <Check size={12} className="text-accent-primary" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      </div>

      {/* Right: connection dot + overflow menu */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-accent-primary' : 'bg-accent-warning animate-pulse'
          )}
          aria-label={isConnected ? 'Connected' : 'Reconnecting'}
        />

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            aria-label="Menu"
            data-testid="overflow-menu-btn"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-surface-elevated border border-surface-card rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <button
                onClick={handleRequestUndo}
                disabled={undoPending}
                className={cn(
                  'w-full text-left px-4 py-3 text-sm font-medium transition-colors',
                  undoPending
                    ? 'text-text-secondary cursor-not-allowed'
                    : 'text-text-primary hover:bg-surface-card'
                )}
                data-testid="menu-request-undo"
              >
                {undoPending ? 'Undo Requested...' : 'Request Undo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
