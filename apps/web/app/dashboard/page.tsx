import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { AppShell } from '@/components/layout/AppShell';

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
      <AssistantPanel />
    </AppShell>
  );
}
