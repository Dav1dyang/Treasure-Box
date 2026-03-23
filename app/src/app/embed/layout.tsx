export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'transparent', margin: 0, minHeight: '100vh' }}>
      {children}
    </div>
  );
}
