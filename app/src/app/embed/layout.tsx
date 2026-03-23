import '../globals.css';

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: 'transparent' }}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inconsolata:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: 'transparent', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
