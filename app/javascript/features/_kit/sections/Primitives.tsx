import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Sparkles } from "lucide-react"
import { Avatar } from "@/components/ui/Avatar"
import { BrandMark } from "@/components/ui/BrandMark"
import { Button, LinkButton } from "@/components/ui/Button"
import { Chip } from "@/components/ui/Chip"
import { ConfirmInline } from "@/components/ui/ConfirmInline"
import { Dropzone } from "@/components/ui/Dropzone"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { Field } from "@/components/ui/Field"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { Pill } from "@/components/ui/Pill"
import { Segmented } from "@/components/ui/Segmented"
import { Select } from "@/components/ui/Select"
import { Sheet } from "@/components/ui/Sheet"
import { Skeleton } from "@/components/ui/Skeleton"
import { Spinner } from "@/components/ui/Spinner"
import { Tabs } from "@/components/ui/Tabs"
import { ToastProvider, useToast } from "@/components/ui/Toast"

export const title = "Primitives"
export const order = 10

function Card({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-[13px] font-semibold text-ink-secondary">{heading}</h3>
      {children}
    </div>
  )
}

function ToastDemo() {
  const { show } = useToast()
  return (
    <Button variant="secondary" size="sm" onClick={() => show("Saved", { tone: "success" })}>
      Show toast
    </Button>
  )
}

export default function Primitives() {
  const [modalOpen, setModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [segment, setSegment] = useState<"30d" | "90d" | "12m">("30d")
  const [tab, setTab] = useState("summary")
  const [chip, setChip] = useState(true)
  const [selectValue, setSelectValue] = useState("all")
  const [confirmPending, setConfirmPending] = useState(false)

  // The inline-confirm demo must not stay pending forever (Cancel is disabled while pending).
  useEffect(() => {
    if (!confirmPending) return
    const id = window.setTimeout(() => setConfirmPending(false), 1200)
    return () => window.clearTimeout(id)
  }, [confirmPending])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card heading="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="outline-brand">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm" variant="secondary">
            Small
          </Button>
          <Button pending>Pending</Button>
          <Button disabled>Disabled</Button>
          <Button leftIcon={<Sparkles className="h-4 w-4" />}>With icon</Button>
          <Button aria-label="Icon only">
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <Card heading="Pill / Spinner / BrandMark">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Neutral</Pill>
          <Pill tone="success">Success</Pill>
          <Pill tone="warning">Warning</Pill>
          <Pill tone="danger">Danger</Pill>
          <Pill tone="violet">Violet</Pill>
          <Pill tone="brand">Brand</Pill>
          <Pill tone="outline">Outline</Pill>
          <Spinner />
          <Spinner size={24} />
          <BrandMark size={28} />
          <BrandMark size={40} />
        </div>
      </Card>

      <Card heading="Field / Input / Select">
        <div className="flex flex-col gap-3">
          <Field label="Work email" hint="We never share it">
            <Input type="email" placeholder="you@agency.com" />
          </Field>
          <Field label="Full name" error="This field is required">
            <Input defaultValue="" />
          </Field>
          <Field label="Status">
            <Select
              value={selectValue}
              onChange={setSelectValue}
              options={[
                { value: "all", label: "All leads" },
                { value: "open", label: "Open only" },
                { value: "closed", label: "Closed" },
              ]}
            />
          </Field>
          <Input disabled placeholder="Disabled" aria-label="Disabled input" />
        </div>
      </Card>

      <Card heading="Segmented / Tabs">
        <div className="flex flex-col gap-3">
          <Segmented
            aria-label="Range"
            value={segment}
            onChange={setSegment}
            options={[
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "12m", label: "12 months" },
            ]}
          />
          <Tabs
            aria-label="Lead detail"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "summary", label: "Summary" },
              { value: "screener", label: "Screener" },
              { value: "activity", label: "Activity" },
            ]}
          />
        </div>
      </Card>

      <Card heading="Chip / Avatar">
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={chip} onClick={() => setChip((value) => !value)}>
            Selectable
          </Chip>
          <Chip onClick={() => {}} leading={<span className="h-2 w-2 rounded-full bg-brand" />}>
            With leading
          </Chip>
          <Chip disabled>Disabled</Chip>
          <Avatar name="Erin Walsh" />
          <Avatar name="Dana Ortiz" size={26} />
          <Avatar name="Jess Kim" size={30} />
          <Avatar name="Priya Shah" size={44} />
          <Avatar name="" />
        </div>
      </Card>

      <Card heading="Skeleton / Empty / Error">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
          <EmptyState title="No leads yet" body="Upload your exports to see leads here." action={<Button size="sm">Upload</Button>} />
          <ErrorState message="We could not reach the server." onRetry={() => {}} />
        </div>
      </Card>

      <Card heading="Toast">
        <ToastProvider>
          <ToastDemo />
        </ToastProvider>
      </Card>

      <Card heading="Modal / Sheet / ConfirmInline">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="outline-brand" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
        </div>
        <div className="mt-3">
          <ConfirmInline
            message="Remove this connection?"
            confirmLabel="Remove"
            pending={confirmPending}
            onCancel={() => setConfirmPending(false)}
            onConfirm={() => setConfirmPending(true)}
          />
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirm a change"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setModalOpen(false)}>Save</Button>
            </>
          }
        >
          <p>Modal content. On a phone this becomes a bottom sheet.</p>
          <div className="mt-3">
            <ConfirmInline
              message="Overlays never stack: confirm inline here."
              confirmLabel="Remove"
              onCancel={() => setModalOpen(false)}
              onConfirm={() => setModalOpen(false)}
            />
          </div>
        </Modal>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Lead panel"
          header={
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-[16px] font-semibold text-ink">Lead panel</h2>
              <Button size="sm" variant="secondary" onClick={() => setSheetOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <p>Slide-over panel. Below 860px it covers the full screen.</p>
          <div className="mt-3">
            <ConfirmInline
              message="Remove this note?"
              confirmLabel="Remove"
              onCancel={() => setSheetOpen(false)}
              onConfirm={() => setSheetOpen(false)}
            />
          </div>
        </Sheet>
      </Card>

      <Card heading="Dropzone">
        <Dropzone
          label="Drop your CSV exports"
          ariaLabel="CSV files"
          multiple
          accept=".csv"
          onFiles={() => {}}
          onRejected={() => {}}
        />
        <div className="mt-3">
          <Dropzone label="Disabled dropzone" ariaLabel="Disabled CSV files" disabled onFiles={() => {}} />
        </div>
      </Card>

      <Card heading="Long labels">
        <div className="flex flex-col gap-2">
          <Button>Import all seven CSV exports</Button>
          <Chip selected>Coordinator with a very long name here</Chip>
          <EmptyState
            title="No leads match your filters"
            body="Try widening the range or clearing the channel filter to see more people."
          />
        </div>
      </Card>

      <Card heading="LinkButton">
        <LinkButton to="/__kit" variant="secondary" size="sm">
          Back to the top
        </LinkButton>
      </Card>
    </div>
  )
}
