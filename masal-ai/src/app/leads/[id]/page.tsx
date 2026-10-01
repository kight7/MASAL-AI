import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/lead-detail";
import { getLead, isDeleteEnabled, readId } from "@/lib/api";
import { getServerSupabase } from "@/lib/supabase/server";
import type { LeadMessage } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = await readId(params);
  const lead = id ? await getLead(id).catch(() => null) : null;
  return { title: lead ? lead.name : "Lead not found" };
}

/** Server component: loads the lead and its chat history with the service-role client. */
export default async function LeadPage({ params }: Props) {
  const id = await readId(params);
  if (!id) notFound();

  const lead = await getLead(id);
  if (!lead) notFound();

  const { data, error } = await getServerSupabase()
    .from("lead_messages")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (
    <LeadDetail
      initialLead={lead}
      initialMessages={(data ?? []) as LeadMessage[]}
      enableDelete={isDeleteEnabled()}
    />
  );
}
