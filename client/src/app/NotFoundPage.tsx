import { ApiError } from '../api/errors';
import { ErrorState } from '../components/ErrorState';
import { usePageHeader } from './pageHeader';

export function NotFoundPage() {
  usePageHeader([{ label: 'Not found' }]);
  return (
    <main className="content" id="main">
      <ErrorState error={new ApiError(404, 'NOT_FOUND', 'Route not found')} />
    </main>
  );
}
