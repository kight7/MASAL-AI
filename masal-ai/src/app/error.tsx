"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when a page throws, e.g. the database is unreachable. Never shows a stack trace. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-20 text-center">
      <h1 className="text-xl font-bold text-[#14213D]">This page could not load</h1>
      <p className="mt-2 text-sm text-[#5B6B80]">
        The server or database did not respond. Your leads are safe. Try again, or go back to the list.
      </p>
      <div className="mt-5 flex gap-2">
        <Button onClick={reset} className="h-10 bg-[#14213D] text-white hover:bg-[#1F3157]">
          <RotateCw className="size-4" aria-hidden />
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md border border-[#D5DDE6] bg-white px-4 text-sm font-medium text-[#14213D] outline-none hover:bg-[#F3F5F8] focus-visible:ring-2 focus-visible:ring-[#14213D]"
        >
          All leads
        </Link>
      </div>
    </div>
  );
}
