import { useSearchParams } from 'react-router';
import type { FileDetail } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { StartAnalysis } from './StartAnalysis';

/** "Analyze" on the file page; `?analyze=1` (from row menus and "Run again") opens the panel directly. */
export function AnalyzeButton({ file }: { file: FileDetail }) {
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  if (file.status !== 'READY') return null;
  const open = params.get('analyze') === '1';
  const setOpen = (o: boolean) =>
    setParams(
      (p) => {
        if (o) p.set('analyze', '1');
        else p.delete('analyze');
        return p;
      },
      { replace: true },
    );
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} style={mobile ? { width: '100%' } : undefined}>
        <Icon name="play" />
        Analyze
      </Button>
      <StartAnalysis file={file} open={open} onOpenChange={setOpen} />
    </>
  );
}
