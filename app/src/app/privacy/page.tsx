'use client';

import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

export default function PrivacyPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="font-mono min-h-screen" style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)' }}>
      {/* Nav */}
      <nav className="fixed top-0 right-0 z-50 flex items-center gap-4 px-5 py-3 text-[10px] tracking-[0.12em]">
        <Link href="/" className="no-underline transition-colors" style={{ color: 'var(--tb-fg-muted)' }}>
          home
        </Link>
        <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
        <button
          onClick={toggleTheme}
          className="cursor-pointer text-[10px]"
          style={{ color: 'var(--tb-fg-faint)' }}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '○' : '●'}
        </button>
      </nav>

      <div className="max-w-[640px] mx-auto px-6 py-20">
        <h1
          className="uppercase leading-none mb-2"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(28px, 6vw, 44px)',
            letterSpacing: '-0.02em',
          }}
        >
          Privacy Policy
        </h1>
        <p className="text-[10px] mb-12" style={{ color: 'var(--tb-fg-ghost)' }}>
          Last updated: March 2026
        </p>

        <Section title="What this app is">
          <P>
            Junk Drawer (also called &ldquo;Treasure Box&rdquo;) is a personal project operated by David Yang.
            It lets you upload photos of meaningful objects, attach stories, and embed a physics-driven
            drawer widget on the web.
          </P>
        </Section>

        <Section title="What data we collect">
          <P>When you sign in with Google, we receive from Firebase Authentication:</P>
          <Ul>
            <Li>Your Google account email address</Li>
            <Li>A unique user ID (Firebase UID)</Li>
          </Ul>
          <P>When you use the app, you may provide:</P>
          <Ul>
            <Li>Photos of items you upload</Li>
            <Li>Item labels, stories, and links you write</Li>
            <Li>Box configuration (title, colors, sound settings, owner name)</Li>
            <Li>AI-generated drawer artwork (created from text prompts you configure)</Li>
          </Ul>
        </Section>

        <Section title="Where your data is stored">
          <P>
            All data is stored in a single Firebase project (on Google Cloud infrastructure)
            operated by the developer. This means:
          </P>
          <Ul>
            <Li>
              <strong style={{ color: 'var(--tb-fg)' }}>Your data is NOT on your own Google account.</strong>{' '}
              It lives in the developer&apos;s Firebase database and storage bucket.
            </Li>
            <Li>
              The developer (David Yang) has administrative access to the Firebase project and can
              technically view all stored data, including your photos, stories, and email address.
            </Li>
            <Li>
              Firebase encrypts data in transit (TLS) and at rest by default.
            </Li>
          </Ul>
        </Section>

        <Section title="Third-party services">
          <P>Your data interacts with these services:</P>
          <table className="w-full text-[10px] mb-4" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--tb-border)' }}>
                <Th>Service</Th>
                <Th>What it receives</Th>
                <Th>Purpose</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td>Firebase (Google)</Td>
                <Td>Email, UID, photos, box data</Td>
                <Td>Authentication, database, file storage</Td>
              </Tr>
              <Tr>
                <Td>Google Gemini AI</Td>
                <Td>Text prompts only (drawer style descriptions — colors, materials, decorations). No photos, no personal info.</Td>
                <Td>Generating drawer artwork</Td>
              </Tr>
              <Tr>
                <Td>Google Cloud Vision (optional)</Td>
                <Td>AI-generated drawer images only. Never your uploaded photos.</Td>
                <Td>Refining background removal on generated art</Td>
              </Tr>
              <Tr>
                <Td>Google Fonts</Td>
                <Td>Standard web font request (your IP address)</Td>
                <Td>Typography</Td>
              </Tr>
            </tbody>
          </table>
          <P>
            <strong style={{ color: 'var(--tb-fg)' }}>Your uploaded photos never leave your browser</strong> for
            processing. Background removal runs entirely in your browser using a WebAssembly library
            (@imgly/background-removal). No server or third party receives your item photos for processing.
          </P>
        </Section>

        <Section title="Public boxes">
          <P>
            Boxes are <strong style={{ color: 'var(--tb-fg)' }}>private by default</strong>. If you toggle your box
            to &ldquo;public&rdquo; in the editor, the following becomes visible to anyone:
          </P>
          <Ul>
            <Li>Your box title and owner name (if you set one)</Li>
            <Li>All item photos, labels, stories, and links in your box</Li>
            <Li>Your box&apos;s visual configuration (colors, drawer style)</Li>
          </Ul>
          <P>
            Your email address is never displayed publicly. You can switch back to private at any time.
          </P>
        </Section>

        <Section title="Tracking and cookies">
          <P>
            This app does <strong style={{ color: 'var(--tb-fg)' }}>not</strong> use analytics, tracking pixels,
            advertising cookies, or any third-party trackers. The only value stored in your browser
            is your theme preference (dark/light) in localStorage.
          </P>
        </Section>

        <Section title="Data retention and deletion">
          <P>
            Your data is stored until you delete it. You can delete all your data at any time:
          </P>
          <Ul>
            <Li>Go to the <Link href="/editor" className="underline" style={{ color: 'var(--tb-accent)' }}>editor</Link></Li>
            <Li>Scroll to &ldquo;danger zone&rdquo; at the bottom of the settings panel</Li>
            <Li>Click &ldquo;delete my box&rdquo; and confirm</Li>
          </Ul>
          <P>
            This permanently removes your box configuration, all items, and all uploaded images from
            Firebase. Your Firebase Authentication record remains (managed by Google) but contains
            no app-specific data.
          </P>
        </Section>

        <Section title="Data sharing">
          <P>
            Your data is never sold, rented, or shared with third parties for marketing purposes.
            Data is only shared with the services listed above as required for the app to function.
          </P>
        </Section>

        <Section title="Security">
          <P>
            Firestore security rules ensure that only you can write to your own box data. Public
            read access is limited to boxes explicitly marked as public. All communication uses HTTPS.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            If you have questions about this policy or want to request data deletion, you can reach
            out via the{' '}
            <a
              href="https://github.com/Dav1dyang/Treasure-Box/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: 'var(--tb-accent)' }}
            >
              GitHub repository
            </a>.
          </P>
        </Section>

        <div className="mt-16 pt-6 text-center" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
          <Link href="/" className="text-[10px] no-underline tracking-[0.12em]" style={{ color: 'var(--tb-fg-faint)' }}>
            &larr; back to junk drawer
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2
        className="text-[12px] uppercase tracking-[0.12em] mb-3"
        style={{ color: 'var(--tb-accent)' }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-[1.7] mb-3" style={{ color: 'var(--tb-fg-muted)' }}>
      {children}
    </p>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-[11px] leading-[1.7]" style={{ color: 'var(--tb-fg-muted)' }}>
      {children}
    </li>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left py-2 pr-3 text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--tb-fg-faint)' }}>
      {children}
    </th>
  );
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>{children}</tr>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-2 pr-3 text-[10px] align-top" style={{ color: 'var(--tb-fg-muted)' }}>
      {children}
    </td>
  );
}
