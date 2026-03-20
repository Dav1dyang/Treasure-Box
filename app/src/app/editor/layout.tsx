import { AuthProvider } from '@/components/AuthProvider';

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
