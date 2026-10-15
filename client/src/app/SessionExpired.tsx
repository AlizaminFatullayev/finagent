import { useLocation, useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Overlays';

/** Shown over the current page when the refresh token is rejected; the only way out is signing in. */
export function SessionExpired({ open }: { open: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Modal
      open={open}
      onOpenChange={() => {}}
      locked
      role="alertdialog"
      maxWidth={400}
      title="Your session expired"
      description="For security, you were signed out after a period of inactivity. Sign in again to continue where you left off."
      footer={
        <Button
          variant="primary"
          onClick={() =>
            navigate('/login', { replace: true, state: { from: location.pathname + location.search } })
          }
        >
          Sign in again
        </Button>
      }
    />
  );
}
