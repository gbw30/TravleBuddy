# Design checks on the real screens

Status: evidence
Authority: What the design walk found. Written by `npm run quality:design`; do not edit by hand.
Related: [requirements](../requirements.md) TB-DSN-01 to TB-DSN-07

Every real screen (Home, Create, a trip with cards, the brief, Profile) is opened in each browser at desktop and phone width, with motion on and asked off, signed in as the development user against the sample places.

A machine cannot judge whether the screens look like a keepsake, or whether a phone is pleasant to use. Those stay the developer's.

| Browser | Checks | Requirements with a failed check |
| --- | --- | --- |
| Chromium 149.0.7827.55 | 56 of 56 pass |  |
| Firefox 151.0 | 56 of 56 pass |  |
| WebKit 26.5 | 56 of 56 pass |  |

## Chromium

| Screen | Check | Requirement | Result | What was found |
| --- | --- | --- | --- | --- |
| Home | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Home | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Home | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Home | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Home | A chosen control differs by more than colour | TB-DSN-06 | pass | 1 groups, each marked by more than colour |
| Home | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 98 controls, each reached by Tab with focus showing |
| Create | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Create | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Create | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Create | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Create | A chosen control differs by more than colour | TB-DSN-06 | pass | 2 groups, each marked by more than colour |
| Create | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 10 controls, each reached by Tab with focus showing |
| Trip | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Trip | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Trip | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | 3 cards, 4 ticket stubs and 4 day stamps, each with text |
| Trip | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Trip | A chosen control differs by more than colour | TB-DSN-06 | pass | 1 groups, each marked by more than colour |
| Trip | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 75 controls, each reached by Tab with focus showing |
| Brief | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Brief | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Brief | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Brief | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Brief | A chosen control differs by more than colour | TB-DSN-06 | pass | no chosen control on this screen |
| Brief | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 14 controls, each reached by Tab with focus showing |
| Profile | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Profile | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Profile | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Profile | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Profile | A chosen control differs by more than colour | TB-DSN-06 | pass | 2 groups, each marked by more than colour |
| Profile | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 17 controls, each reached by Tab with focus showing |
| Trip | A card is flipped and picked with the keyboard | TB-DSN-05 | pass | Enter flips the card; Enter on Pick puts the place in the plan |
| Profile | A slider is moved with the arrow keys | TB-DSN-05 | pass | the arrow key changes the pace, and its spoken value |
| Brief | The brief's steps are walked with the keyboard | TB-DSN-05 | pass | Enter on the step button moves to the next step |
| Home | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Home | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Home | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Home | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 98 controls, none too small |
| Create | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Create | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Create | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Create | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 10 controls, none too small |
| Trip | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Trip | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Trip | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Trip | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 57 controls, none too small |
| Brief | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Brief | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Brief | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Brief | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 14 controls, none too small |
| Profile | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Profile | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Profile | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Profile | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 17 controls, none too small |
| Trip | Nothing moves when the device asks for less motion | TB-DSN-03 | pass | loading each screen, hovering, flipping, the closer look and picking: no movement |
| Trip | A card flips on click | TB-DSN-02 | pass | the card turns over, and says so to screen readers |
| Trip | A picked card visibly moves to its slot | TB-DSN-02 | pass | picking started a view transition from the card to the slot |

## Firefox

| Screen | Check | Requirement | Result | What was found |
| --- | --- | --- | --- | --- |
| Home | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Home | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Home | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Home | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Home | A chosen control differs by more than colour | TB-DSN-06 | pass | 1 groups, each marked by more than colour |
| Home | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 98 controls, each reached by Tab with focus showing |
| Create | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Create | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Create | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Create | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Create | A chosen control differs by more than colour | TB-DSN-06 | pass | 2 groups, each marked by more than colour |
| Create | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 10 controls, each reached by Tab with focus showing |
| Trip | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Trip | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Trip | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | 3 cards, 4 ticket stubs and 4 day stamps, each with text |
| Trip | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Trip | A chosen control differs by more than colour | TB-DSN-06 | pass | 1 groups, each marked by more than colour |
| Trip | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 75 controls, each reached by Tab with focus showing |
| Brief | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Brief | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Brief | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Brief | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Brief | A chosen control differs by more than colour | TB-DSN-06 | pass | no chosen control on this screen |
| Brief | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 14 controls, each reached by Tab with focus showing |
| Profile | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Profile | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Profile | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Profile | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Profile | A chosen control differs by more than colour | TB-DSN-06 | pass | 2 groups, each marked by more than colour |
| Profile | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 17 controls, each reached by Tab with focus showing |
| Trip | A card is flipped and picked with the keyboard | TB-DSN-05 | pass | Enter flips the card; Enter on Pick puts the place in the plan |
| Profile | A slider is moved with the arrow keys | TB-DSN-05 | pass | the arrow key changes the pace, and its spoken value |
| Brief | The brief's steps are walked with the keyboard | TB-DSN-05 | pass | Enter on the step button moves to the next step |
| Home | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Home | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Home | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Home | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 98 controls, none too small |
| Create | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Create | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Create | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Create | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 10 controls, none too small |
| Trip | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Trip | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Trip | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Trip | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 57 controls, none too small |
| Brief | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Brief | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Brief | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Brief | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 14 controls, none too small |
| Profile | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Profile | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Profile | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Profile | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 17 controls, none too small |
| Trip | Nothing moves when the device asks for less motion | TB-DSN-03 | pass | loading each screen, hovering, flipping, the closer look and picking: no movement |
| Trip | A card flips on click | TB-DSN-02 | pass | the card turns over, and says so to screen readers |
| Trip | A picked card visibly moves to its slot | TB-DSN-02 | pass | picking started a view transition from the card to the slot |

## WebKit

| Screen | Check | Requirement | Result | What was found |
| --- | --- | --- | --- | --- |
| Home | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Home | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Home | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Home | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Home | A chosen control differs by more than colour | TB-DSN-06 | pass | 1 groups, each marked by more than colour |
| Home | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 98 controls, each reached by Tab with focus showing |
| Create | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Create | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Create | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Create | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Create | A chosen control differs by more than colour | TB-DSN-06 | pass | 2 groups, each marked by more than colour |
| Create | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 10 controls, each reached by Tab with focus showing |
| Trip | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Trip | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Trip | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | 3 cards, 4 ticket stubs and 4 day stamps, each with text |
| Trip | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Trip | A chosen control differs by more than colour | TB-DSN-06 | pass | 1 groups, each marked by more than colour |
| Trip | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 75 controls, each reached by Tab with focus showing |
| Brief | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Brief | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Brief | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Brief | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Brief | A chosen control differs by more than colour | TB-DSN-06 | pass | no chosen control on this screen |
| Brief | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 14 controls, each reached by Tab with focus showing |
| Profile | Text contrast is AA (axe, desktop) | TB-DSN-06 | pass | no contrast violation |
| Profile | Names, roles and structure (axe, desktop) | TB-DSN-07 | pass | no violation |
| Profile | Pictures, stamps, ticket stubs and cards have text for screen readers | TB-DSN-07 | pass | every picture and icon is named or hidden |
| Profile | Paper background and serif headings | TB-DSN-01 | pass | the page is on paper and its heading is in the serif |
| Profile | A chosen control differs by more than colour | TB-DSN-06 | pass | 2 groups, each marked by more than colour |
| Profile | Tab reaches every control, focus shows, nothing is click-only | TB-DSN-05 | pass | 17 controls, each reached by Tab with focus showing |
| Trip | A card is flipped and picked with the keyboard | TB-DSN-05 | pass | Enter flips the card; Enter on Pick puts the place in the plan |
| Profile | A slider is moved with the arrow keys | TB-DSN-05 | pass | the arrow key changes the pace, and its spoken value |
| Brief | The brief's steps are walked with the keyboard | TB-DSN-05 | pass | Enter on the step button moves to the next step |
| Home | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Home | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Home | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Home | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 98 controls, none too small |
| Create | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Create | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Create | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Create | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 10 controls, none too small |
| Trip | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Trip | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Trip | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Trip | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 57 controls, none too small |
| Brief | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Brief | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Brief | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Brief | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 14 controls, none too small |
| Profile | Text contrast is AA (axe, phone) | TB-DSN-06 | pass | no contrast violation |
| Profile | Names, roles and structure (axe, phone) | TB-DSN-07 | pass | no violation |
| Profile | No sideways scrolling at 390 and 320 px | TB-DSN-04 | pass | the page fits both widths |
| Profile | Touch targets are at least 24 by 24 px | TB-DSN-04 | pass | 17 controls, none too small |
| Trip | Nothing moves when the device asks for less motion | TB-DSN-03 | pass | loading each screen, hovering, flipping, the closer look and picking: no movement |
| Trip | A card flips on click | TB-DSN-02 | pass | the card turns over, and says so to screen readers |
| Trip | A picked card visibly moves to its slot | TB-DSN-02 | pass | picking started a view transition from the card to the slot |
