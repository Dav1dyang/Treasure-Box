export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-embed style={{ background: 'transparent', margin: 0, minHeight: '100vh' }}>
      {children}
    </div>
  );
}
