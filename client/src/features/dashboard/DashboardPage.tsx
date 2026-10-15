import { usePageHeader } from '../../app/pageHeader';

export function DashboardPage() {
  usePageHeader([{ label: 'Dashboard' }]);
  return (
    <main className="content" id="main">
      <h1 className="t24">Dashboard</h1>
    </main>
  );
}
