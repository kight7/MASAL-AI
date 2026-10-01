import Link from "next/link";

/** Shown for unknown URLs and for leads that do not exist or were deleted. */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-20 text-center">
      <h1 className="text-xl font-bold text-[#14213D]">Lead not found</h1>
      <p className="mt-2 text-sm text-[#5B6B80]">This lead does not exist or was deleted.</p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-[#14213D] px-4 text-sm font-medium text-white outline-none hover:bg-[#1F3157] focus-visible:ring-2 focus-visible:ring-[#14213D] focus-visible:ring-offset-2"
      >
        Back to all leads
      </Link>
    </div>
  );
}
