import { ApprovalsWorkspace } from '@/components/approvals/ApprovalsWorkspace';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { AppShell } from '@/components/layout/AppShell';

export default function HomePage() {
  return (
    <AppShell>
      <ApprovalsWorkspace />
      <AssistantPanel />
    </AppShell>
  );
}
