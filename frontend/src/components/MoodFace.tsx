import type { MoodPoint } from "../api/types";

/**
 * The five faces, drawn here (Epic 24, AD-42).
 *
 * **Why not an emoji.** The same codepoint is a different drawing on iOS, Android and
 * Windows, and this family shares neither device nor OS: 😐 is a flat grey line on one
 * phone and a faintly unhappy yellow face on another, so two people picking "the neutral
 * one" would not be picking the same picture. A chart legend would mean something
 * different on every device it was opened on. These are inline SVG, like every chart in
 * this codebase, so the drawing is the same everywhere and is versioned with the code.
 *
 * **Every face ships with its word.** The SVG is `aria-hidden` and the label beside it is
 * real text, which is what makes the control usable by a screen reader, findable by a
 * search, and speakable out loud — a face nobody can name still has a name. That is the
 * whole answer to "what happens to a face nobody can name": no face is ever shipped alone.
 *
 * **The stored value is the point, not the drawing.** Restyling these faces rewrites no
 * row, because no row holds one.
 */

export interface MoodStep {
  point: MoodPoint;
  /** The accessible name. Not decoration — see above. */
  word: string;
}

/**
 * One axis, worse to better. Five and not four: "fine, nothing to report" is the most
 * common truthful answer a person has about a day, and forcing them off it is a survey
 * device for extracting signal from people who do not care — the opposite of the reader
 * here, who is the only one who will ever look at this.
 */
export const MOOD_SCALE: MoodStep[] = [
  { point: 1, word: "Bad" },
  { point: 2, word: "Low" },
  { point: 3, word: "Fine" },
  { point: 4, word: "Good" },
  { point: 5, word: "Great" },
];

export const moodWord = (point: MoodPoint): string =>
  MOOD_SCALE.find((step) => step.point === point)?.word ?? "";

/** The colour ramp, in one place, so the faces and the strip cannot drift apart. */
export const moodColour = (point: MoodPoint): string => `var(--mood-${point})`;

// The mouth carries the whole scale on its own — the curve goes monotonically from a deep
// frown to a wide smile — so the drawing says "one axis" the way the data does. The eyes
// only lift at the top of the scale, where a smile alone starts to look like a grimace.
const MOUTHS: Record<MoodPoint, string> = {
  1: "M7.5 16.8 Q12 11.4 16.5 16.8",
  2: "M7.8 16.2 Q12 13.4 16.2 16.2",
  3: "M8.2 15.2 H15.8",
  4: "M7.8 14.2 Q12 16.8 16.2 14.2",
  5: "M7.2 13.6 Q12 18.8 16.8 13.6",
};

export function MoodFace({ point, size = 24 }: { point: MoodPoint; size?: number }) {
  const colour = moodColour(point);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="mood-face"
      // Decorative: the word beside it is the name. An `aria-label` here as well would make
      // a screen reader say the same thing twice.
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke={colour} strokeWidth="1.6" />
      {point === 5 ? (
        <>
          <path d="M6.9 10.1 Q8.6 8.2 10.3 10.1" fill="none" stroke={colour} strokeWidth="1.6" />
          <path d="M13.7 10.1 Q15.4 8.2 17.1 10.1" fill="none" stroke={colour} strokeWidth="1.6" />
        </>
      ) : (
        <>
          <circle cx="8.6" cy="9.6" r="1.2" fill={colour} />
          <circle cx="15.4" cy="9.6" r="1.2" fill={colour} />
        </>
      )}
      <path
        d={MOUTHS[point]}
        fill="none"
        stroke={colour}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The same face with nothing said yet: an outline and no features.
 *
 * Not "☺" — a codepoint would be a colour emoji on some platforms and a line drawing on
 * others, which is the whole problem this module exists to avoid, and the trigger sits
 * beside five drawn faces where a rendering mismatch would be obvious.
 */
export function MoodFaceUnanswered({ size = 24 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="mood-face"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="var(--faint)"
        strokeWidth="1.6"
        strokeDasharray="3 3"
      />
    </svg>
  );
}
