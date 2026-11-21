import { recordWordings } from "@/features/conversation";
import { db } from "@/lib/db";
import { factsKeyOf, fill, type Sentence } from "@/lib/wording";

/**
 * The words to show for each subject, and the record of them. With the
 * model off, the words are the filled templates. Called outside any
 * transaction: a record that cannot be written fails the read, as any read
 * of a trip that is gone does.
 */
export async function shownWords(
  tripId: string,
  items: { subject: string; sentences: Sentence[] }[],
): Promise<string[]> {
  const shown = items.map(({ sentences }) => sentences.map(fill).join(" "));
  await recordWordings(
    db,
    tripId,
    items.map(({ subject, sentences }, i) => ({
      subject,
      factsKey: factsKeyOf(sentences),
      sentences,
      shown: shown[i],
      wordedBy: "template",
      fallback: "off",
    })),
  );
  return shown;
}
