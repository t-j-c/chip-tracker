interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-[100dvh] bg-surface-bg text-text-primary">
      {children}
    </div>
  );
}
