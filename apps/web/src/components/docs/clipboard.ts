export type CopyResult = { status: "copied" } | { status: "error" };

/** Writer injection keeps permission failures and pending writes testable. */
export async function copyText(text: string, write: (value: string) => Promise<void>): Promise<CopyResult> {
  if (!text) return { status: "error" };
  try {
    await write(text);
    return { status: "copied" };
  } catch {
    return { status: "error" };
  }
}
