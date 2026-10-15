import { useState, type ReactNode } from 'react';
import type { User } from '../api/types';
import { RoleBadge, SeverityBadge, StatusBadge, Tag } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ChartCard } from '../components/ui/ChartCard';
import { Checkbox, Segmented, Toggle } from '../components/ui/Controls';
import { Dropzone, type DropzoneVariant } from '../components/ui/Dropzone';
import { PasswordField, SearchInput, TextareaField, TextField } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { Drawer, FilterSelect, Menu, Modal, Tabs, Tip } from '../components/ui/Overlays';
import { Stepper } from '../components/ui/Stepper';
import { Banner, Card, EmptyState, ProgressBar, StatCard, StatSkeleton } from '../components/ui/Surfaces';
import { LoadMore, Table } from '../components/ui/Table';
import { notify } from '../components/ui/Toast';
import { TokenChip } from '../components/ui/TokenChip';
import { Sidebar } from '../components/shell/Sidebar';
import { TopBar } from '../components/shell/TopBar';
import { currentTheme, saveTheme } from '../lib/theme';

// Dev-only page (excluded from production builds): every component and state, for design review
// against pages/Main.html. All data here is synthetic.

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="col" style={{ gap: 24 }}>
    <h2 className="t24">{title}</h2>
    {children}
  </section>
);

const demoUser: User = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'r.karimli@bank.az',
  name: 'Rauf Karimli',
  role: 'ADMIN',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-06-02T09:00:00.000Z',
};

const DROP_VARIANTS: DropzoneVariant[] = [
  'idle',
  'over',
  'uploading',
  'parsing',
  'success',
  'duplicate',
  'wrongFormat',
  'corrupted',
  'tooLarge',
  'limits',
];

export default function DesignSystemPage() {
  const [theme, setTheme] = useState(currentTheme());
  const [reason, setReason] = useState('Verifying counterparty for case FIN-2231');
  const [lang, setLang] = useState<'en' | 'az'>('en');
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState('a');
  const [status, setStatus] = useState('all');
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selected, setSelected] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '64px 40px 96px',
        display: 'flex',
        flexDirection: 'column',
        gap: 64,
      }}
    >
      <header className="col" style={{ gap: 16, maxWidth: 760 }}>
        <div className="row">
          <span className="mark">FA</span>
          <span className="over">FinAgent / Design system v1</span>
        </div>
        <h1 className="t32" style={{ fontSize: 48, lineHeight: '56px' }}>
          Calm, precise, safe by default.
        </h1>
        <div className="row">
          <Button
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              saveTheme(next);
              setTheme(next);
            }}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </Button>
        </div>
      </header>

      <Section title="Buttons">
        <Card className="pad col" style={{ gap: 16 }}>
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
            <div key={v} className="row wrap" style={{ gap: 16 }}>
              <span className="mono muted" style={{ width: 120 }}>
                {v}
              </span>
              <Button variant={v}>
                {v === 'danger' ? 'Delete file' : v === 'ghost' ? 'Cancel' : 'Analyze'}
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
              {v !== 'ghost' && (
                <Button variant={v} loading>
                  {v === 'danger' ? 'Deleting…' : 'Starting…'}
                </Button>
              )}
            </div>
          ))}
          <div className="row wrap" style={{ gap: 16 }}>
            <span className="mono muted" style={{ width: 120 }}>
              icon, sizes
            </span>
            <Button icon aria-label="More actions">
              <Icon name="more" />
            </Button>
            <Button icon size="lg" aria-label="Close">
              <Icon name="x" />
            </Button>
            <Button size="sm">Small 32</Button>
            <Button>Default 36</Button>
            <Button size="lg" variant="primary">
              Large 44
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="Inputs and selection">
        <div className="grid-3">
          <Card className="pad col" style={{ gap: 16 }}>
            <TextField label="Email" placeholder="name@bank.az" />
            <TextField label="Error" defaultValue="r.karimli@" error="Enter a valid email address" />
            <TextField label="Disabled" defaultValue="Locked by policy" disabled />
            <PasswordField label="Password" defaultValue="secret-value" />
          </Card>
          <Card className="pad col" style={{ gap: 16 }}>
            <div className="field">
              <span className="label">Filter</span>
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'READY', label: 'Ready' },
                  { value: 'FAILED', label: 'Failed' },
                ]}
              />
            </div>
            <div className="field">
              <span className="label">Search</span>
              <SearchInput placeholder="Search files" aria-label="Search files" />
            </div>
            <Menu
              items={[
                { label: 'Open', icon: 'eye' },
                { label: 'Analyze', icon: 'play' },
                'separator',
                { label: 'Delete', icon: 'trash', danger: true },
              ]}
              trigger={
                <Button icon aria-label="Row actions">
                  <Icon name="more" />
                </Button>
              }
            />
          </Card>
          <Card className="pad col" style={{ gap: 16 }}>
            <span className="label">Checkbox, toggle, segmented</span>
            <Checkbox checked={checked} onChange={setChecked}>
              Analysis completed
            </Checkbox>
            <div className="row" style={{ gap: 12 }}>
              <Toggle checked={on} onChange={setOn} label="Active" />
              <span>{on ? 'Active' : 'Inactive'}</span>
            </div>
            <Segmented
              label="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'az', label: 'Azərbaycan' },
              ]}
            />
            <TextareaField
              label="Reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              help="5–200 characters"
            />
          </Card>
        </div>
      </Section>

      <Section title="Badges and token chips">
        <div className="grid-2">
          <Card className="pad col" style={{ gap: 16 }}>
            <div className="over">File status</div>
            <div className="row wrap">
              {(['UPLOADED', 'PROCESSING', 'READY', 'FAILED'] as const).map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
            <div className="over">Severity</div>
            <div className="row wrap">
              {(['LOW', 'MEDIUM', 'HIGH'] as const).map((s) => (
                <SeverityBadge key={s} severity={s} />
              ))}
            </div>
            <div className="over">Column type, audit action, role</div>
            <div className="row wrap">
              {['number', 'currency', 'percent', 'date', 'boolean', 'id', 'text', 'pii.unmask'].map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              {(['ANALYST', 'MANAGER', 'ADMIN'] as const).map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
          </Card>
          <Card className="pad col" style={{ gap: 16 }}>
            <div className="over">Token chip states</div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center' }}>
              <span className="t12 muted">Masked</span>
              <span>
                <TokenChip token="[PERSON_3]" showIcon onShow={() => setRevealed(true)} />
              </span>
              <span className="t12 muted">Selectable</span>
              <span>
                <TokenChip
                  token="[IBAN_1]"
                  selectable
                  selected={selected}
                  onToggle={() => setSelected(!selected)}
                  onShow={() => {}}
                />
              </span>
              <span className="t12 muted">Revealed</span>
              <span>
                {revealed ? (
                  <TokenChip token="[PERSON_3]" value="Aysel Nurlu" onHide={() => setRevealed(false)} />
                ) : (
                  <span className="t12 muted">Press Show above</span>
                )}
              </span>
              <span className="t12 muted">Not found</span>
              <span>
                <TokenChip token="[PERSON_44]" notFound />
              </span>
              <span className="t12 muted">Re-mask notice</span>
              <span className="row t12 sec">
                <Icon name="clock" />
                Hides again in <span className="mono">0:42</span>
              </span>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Surfaces and feedback">
        <div className="grid-3">
          <StatCard label="Anomalies found" value="27" context="3 high · 9 medium · 15 low" />
          <StatSkeleton />
          <Card className="pad col" style={{ gap: 12 }}>
            <Tabs
              label="Sheets"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'a', label: 'Transactions', count: '46,902' },
                { value: 'b', label: 'Accounts', count: '1,312' },
              ]}
            >
              <Stepper
                steps={[
                  { label: 'Parsing', state: 'done', fill: 100 },
                  { label: 'Analyzing', state: 'current', fill: 60 },
                  { label: 'Summarizing', state: 'pending', fill: 0 },
                  { label: 'Done', state: 'pending', fill: 0 },
                ]}
              />
            </Tabs>
            <ProgressBar percent={34} label="Upload progress" />
            <Tip content="Unsupported file. Upload .xlsx or .csv.">
              <span tabIndex={0} className="t12 sec">
                Hover or focus for a tooltip
              </span>
            </Tip>
          </Card>
        </div>
        <div className="grid-2">
          <div className="col" style={{ gap: 8 }}>
            <Banner kind="info" icon="refresh" title="A previous result is available">
              Same file, language and columns.
            </Banner>
            <Banner kind="warn" title="2 unverified figures">
              Not matched to computed data.
            </Banner>
            <Banner
              kind="error"
              title="Something went wrong on our side"
              action={<Button size="sm">Retry</Button>}
            >
              Your file is safe. Try again in a moment.
            </Banner>
            <Banner kind="ok" title="User created" />
          </div>
          <div className="col" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Button
              onClick={() =>
                notify({
                  icon: 'check',
                  title: 'Analysis completed',
                  body: 'transactions_q3_2026.xlsx · 27 anomalies',
                })
              }
            >
              Show a toast
            </Button>
            <Button
              onClick={() =>
                notify({
                  icon: 'alert',
                  title: 'Analysis failed',
                  body: 'the file is still available',
                  error: true,
                })
              }
            >
              Show an error toast
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Table, dialog, drawer, empty state">
        <div className="grid-2">
          <Card style={{ overflow: 'hidden' }}>
            <Table>
              <thead>
                <tr>
                  <th className="sticky">Date</th>
                  <th>Counterparty</th>
                  <th style={{ textAlign: 'right' }}>Amount (AZN)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="sticky mono">2026-09-14</td>
                  <td>
                    <TokenChip token="[PERSON_3]" onShow={() => {}} />
                  </td>
                  <td className="num">9,850.00</td>
                </tr>
              </tbody>
            </Table>
            <LoadMore hasMore onLoad={() => {}} />
          </Card>
          <Card className="pad row" style={{ gap: 8 }}>
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          </Card>
        </div>
        <Card>
          <EmptyState
            icon="file"
            title="No files yet"
            action={
              <Button variant="primary" onClick={() => {}}>
                Upload a file
              </Button>
            }
          >
            Upload an .xlsx or .csv file to get statistics, anomalies and a summary.
          </EmptyState>
        </Card>
        <Modal
          open={dialog}
          onOpenChange={setDialog}
          role="alertdialog"
          maxWidth={440}
          title="Delete this file?"
          description="transactions_q3_2026.xlsx will be removed. This can’t be undone."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Delete file
              </Button>
            </>
          }
        />
        <Drawer
          open={drawer}
          onOpenChange={setDrawer}
          title="Affected rows"
          subtitle="Structuring · 41 rows"
          badge={<SeverityBadge severity="HIGH" />}
        >
          <div style={{ padding: 24 }}>Drawer body</div>
        </Drawer>
      </Section>

      <Section title="Dropzone">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
            gap: 24,
          }}
        >
          {DROP_VARIANTS.map((v, i) => (
            <div key={v} className="col" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="mono muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="w5">{v}</span>
              </div>
              <Dropzone
                variant={v}
                fileName="transactions_q3_2026.xlsx"
                detail="transactions_q3_2026.xlsx · 8.4 MB"
                percent={v === 'uploading' ? 61 : 72}
                stage={v === 'uploading' ? 'Uploading · 5.1 of 8.4 MB' : 'Parsing'}
                hint={v === 'uploading' ? 'About 4 seconds left' : 'Reading sheets'}
                summary="2 sheets · 48,214 rows"
                actions={<Button size="lg">Upload another</Button>}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Chart card">
        <div className="grid-2">
          <ChartCard
            group="Activity"
            title="Transactions by hour"
            bucket="hour"
            note="Hour of day, Asia/Baku"
            onExpand={() => {}}
          >
            <div className="bars">
              {[20, 40, 70, 90, 60, 30].map((h, i) => (
                <div key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </ChartCard>
          <ChartCard title="Loading" loading />
        </div>
      </Section>

      <Section title="Shell">
        <div style={{ display: 'grid', gridTemplateColumns: '240px 64px 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{ height: 520, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <Sidebar role="ADMIN" collapsed={false} onToggle={() => {}} />
          </div>
          <div style={{ height: 520, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <Sidebar role="ANALYST" collapsed onToggle={() => {}} />
          </div>
          <TopBar
            crumbs={[{ label: 'Files', to: '/files' }, { label: 'transactions_q3_2026.xlsx' }]}
            user={demoUser}
            theme={theme}
            onToggleTheme={() => {}}
            notifications={[]}
            unread={2}
            onOpenNotifications={() => {}}
            onSignOut={() => {}}
          />
        </div>
      </Section>
    </div>
  );
}
