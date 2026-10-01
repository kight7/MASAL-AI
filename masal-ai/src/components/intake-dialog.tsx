"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_CREATED_EVENT } from "@/hooks/use-leads";
import { LeadInputSchema, MESSAGE_MAX, TIMELINES, TIMELINE_LABELS } from "@/lib/ai/schemas";
import type { Lead } from "@/lib/types";
import { z } from "zod";

type FormState = {
  name: string;
  location: string;
  property_requirement: string;
  budget: string;
  timeline: string;
  contact: string;
  message: string;
};
type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  name: "",
  location: "",
  property_requirement: "",
  budget: "",
  timeline: "",
  contact: "",
  message: "",
};

function firstErrors(fieldErrors: Record<string, string[] | undefined>): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, msgs] of Object.entries(fieldErrors)) {
    if (msgs?.[0]) out[key as keyof FormState] = msgs[0];
  }
  return out;
}

/** "+ New lead" button that opens the intake dialog. Used in the header and the empty state. */
export function NewLeadButton({ size = "default" }: { size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        onClick={() => setOpen(true)}
        className={`bg-[#14213D] text-white hover:bg-[#1F3157] ${size === "sm" ? "h-10 sm:h-8" : "h-10"}`}
      >
        <Plus className="size-4" aria-hidden />
        New lead
      </Button>
      <IntakeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function IntakeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // prevents double submit

    const parsed = LeadInputSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 400 && body?.fieldErrors) {
        setErrors(firstErrors(body.fieldErrors));
        return;
      }
      if (res.status === 429) {
        toast.error("Demo limit reached, please try again later.");
        return;
      }
      if (!res.ok) {
        toast.error(body?.error ?? "The lead could not be saved. Please try again.");
        return;
      }

      const lead = body as Lead;
      window.dispatchEvent(new CustomEvent<Lead>(LEAD_CREATED_EVENT, { detail: lead }));
      if (lead.status === "failed") {
        toast.warning(`Both AI providers are busy. ${lead.name} is saved, retry in a minute from the card.`);
      } else {
        toast.success(`${lead.name} added as a ${lead.tier} lead (score ${lead.score}).`);
      }
      setForm(EMPTY);
      setErrors({});
      onOpenChange(false);
      if (pathname !== "/") router.push("/");
    } catch {
      toast.error("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = (key: keyof FormState) =>
    errors[key] ? "border-[#C8233C] focus-visible:ring-[#C8233C]/30" : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            Paste the inquiry or chat. The AI scores it, ranks it and suggests your next step.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Name" error={errors.name}>
              <Input id="name" value={form.name} onChange={set("name")} placeholder="Riya Sharma" autoComplete="off" aria-invalid={!!errors.name} className={fieldClass("name")} />
            </Field>
            <Field id="location" label="Location" error={errors.location}>
              <Input id="location" value={form.location} onChange={set("location")} placeholder="Sector 62, Noida" aria-invalid={!!errors.location} className={fieldClass("location")} />
            </Field>
          </div>

          <Field id="property_requirement" label="Property requirement" error={errors.property_requirement}>
            <Input id="property_requirement" value={form.property_requirement} onChange={set("property_requirement")} placeholder="3BHK apartment near metro, high floor" aria-invalid={!!errors.property_requirement} className={fieldClass("property_requirement")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="budget" label="Budget" error={errors.budget}>
              <Input id="budget" value={form.budget} onChange={set("budget")} placeholder="1.2-1.5 Cr" aria-invalid={!!errors.budget} className={fieldClass("budget")} />
            </Field>
            <Field id="timeline" label="Buying timeline" error={errors.timeline}>
              <select
                id="timeline"
                value={form.timeline}
                onChange={set("timeline")}
                aria-invalid={!!errors.timeline}
                className={`h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-[#14213D]/20 ${
                  errors.timeline ? "border-[#C8233C]" : "border-input"
                } ${form.timeline ? "" : "text-muted-foreground"}`}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {TIMELINES.map((t) => (
                  <option key={t} value={t}>
                    {TIMELINE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field id="contact" label="Phone or email" optional error={errors.contact}>
            <Input id="contact" value={form.contact} onChange={set("contact")} placeholder="+91 98xxx xxxxx" autoComplete="off" aria-invalid={!!errors.contact} className={fieldClass("contact")} />
          </Field>

          <Field
            id="message"
            label="Customer message"
            error={errors.message}
            aside={
              <span className={form.message.length > MESSAGE_MAX ? "text-[#C8233C]" : undefined}>
                {form.message.length}/{MESSAGE_MAX}
              </span>
            }
          >
            <Textarea
              id="message"
              value={form.message}
              onChange={set("message")}
              rows={6}
              placeholder="Paste the inquiry, email or chat transcript"
              aria-invalid={!!errors.message}
              className={`resize-y ${fieldClass("message") ?? ""}`}
            />
          </Field>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="bg-[#14213D] text-white hover:bg-[#1F3157]">
              {submitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  Analyzing lead…
                </>
              ) : (
                "Add and analyze"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  optional,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </Label>
        {aside && <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-[#C8233C]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
