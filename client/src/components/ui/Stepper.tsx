import { cx } from '../../lib/cx';
import { Icon } from './Icon';

export type StepState = 'pending' | 'current' | 'done' | 'failed';
export type Step = { label: string; state: StepState; /** 0-100 fill of the step line. */ fill: number };

/** Parsing -> Analyzing -> Summarizing -> Done, as in Progress.html. */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="stepper" role="list">
      {steps.map((s) => (
        <div
          key={s.label}
          role="listitem"
          className={cx(
            'step',
            s.state === 'done' && 'done',
            s.state === 'current' && 'cur',
            s.state === 'failed' && 'fail cur',
          )}
          aria-current={s.state === 'current' ? 'step' : undefined}
        >
          <div className="ln">
            <i
              style={{
                width: `${s.state === 'done' ? 100 : s.state === 'pending' ? 0 : s.fill}%`,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
          <div className="lb">
            {s.state === 'done' && <Icon name="check" />}
            {s.state === 'current' && <span className="pulse" />}
            {s.state === 'failed' && <Icon name="x" />}
            <span>{s.label}</span>
            <span className="sr-only">
              {s.state === 'done'
                ? ', done'
                : s.state === 'current'
                  ? ', in progress'
                  : s.state === 'failed'
                    ? ', failed'
                    : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
