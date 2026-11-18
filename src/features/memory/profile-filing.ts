import type { ProfileTopic, ProfileTopicInfo } from "./contracts";

// Where something the traveller says about themselves belongs (TB-MEM-14).
// It becomes an entry only when it plainly is one of a topic's values, or an
// allergy. Anything else is kept as a note: a sentence such as "I get tired
// of museums after two hours" mentions museums and must not be read as
// liking them.

export type Filed =
  | { type: "entry"; topic: ProfileTopic; value: string }
  | { type: "note"; text: string };

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.!?,;:"“”()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const OPENERS =
  /^(?:i am|i'm|i’m|we are|we're|i like|i love|i prefer|we like|we prefer|i eat|we eat|i only eat|i want|always)\s+(?:an?\s+|the\s+)?/;
const ALLERGY =
  /^(?:(?:i am|i'm|i’m|we are)\s+)?(?:allergic to|allergy to|an? allergy to)\s+(.+)$|^(.+?)\s+allergy$|^no\s+(.+)$/;

/**
 * Files what was said. `hard` is the traveller saying it is a rule never to
 * be broken: only then can free words become an allergy.
 */
export function fileUnder(
  said: string,
  hard: boolean,
  topics: ProfileTopicInfo[],
): Filed {
  const text = said.trim().slice(0, 300);
  const words = plain(text);
  const bare = words.replace(OPENERS, "");

  for (const info of topics) {
    const choice = info.choices.find((item) =>
      [item.value.toLowerCase(), plain(item.label)].some(
        (name) => name === words || name === bare,
      ),
    );
    if (choice)
      return { type: "entry", topic: info.topic, value: choice.value };
  }

  const allergy = ALLERGY.exec(words);
  const food = (allergy?.[1] ?? allergy?.[2] ?? allergy?.[3])?.trim();
  // "Allergic to shellfish" is an allergy however it is ticked; a bare
  // "no shellfish" is one only when the traveller made it a rule.
  if (food && food.length <= 80 && (hard || !allergy?.[3])) {
    return { type: "entry", topic: "allergies", value: food };
  }
  return { type: "note", text };
}
