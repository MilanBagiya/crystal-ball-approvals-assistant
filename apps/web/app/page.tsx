import { ApprovalsTable } from '@/components/approvals/ApprovalsTable';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-sm font-medium text-orange-600">Digital twin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Approvals &amp; Review</h1>
        <p className="mt-1 text-sm text-slate-600">
          Items submitted for review across your site recordings and patrols.
        </p>
      </header>
      <ApprovalsTable />
      <AssistantPanel />
    </main>
  );
}
