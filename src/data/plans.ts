import type { CustomCue } from '../models/customPlanModel';
import type { PlanTemplate, TemplateItem } from '../models/planImportModel';
import type { SegmentType } from '../models/segmentModel';

const SIT_BLUE = 'sita í bláum';
const STAND_GREEN = 'standa í grønum';
const SIT_GREEN = 'sita í grønum';
const STAND_YELLOW = 'standa (gult)';

function item(
  title: string,
  artist: string,
  type: SegmentType,
  rpm: number | undefined,
  cues: CustomCue[],
  extra: { playSeconds?: number; note?: string } = {},
): TemplateItem {
  return { title, artist, type, custom: { rpm, cues, ...extra } };
}

/** Innisúkkling 240226, transcribed from the instructor's PDF. Times are seconds from the start of each song. */
export const INNISUKKLING_240226: PlanTemplate = {
  id: 'innisukkling-240226',
  name: 'Innisúkkling 240226',
  items: [
    item('Alla nátt', 'Hjarnar', 'warmup', 62, [{ at: 0, zone: 'blue', label: 'Sita allan sangin' }]),
    item('Stor mand', 'Tobias Rahim feat. Andreas Odbjerg', 'warmup', 73, [
      { at: 0, zone: 'blue', label: 'Sita í bláum' },
      { at: 99, zone: 'green', label: 'Sita í grønum' },
    ]),
    item('Taxa', 'Sanne Salomonsen', 'warmup', 55, [{ at: 0, zone: 'green', label: 'Standa allan sangin' }]),
    item('Rasputin', 'Boney M', 'climb', 63, [
      { at: 0, zone: 'green', label: 'Sita í grønum' },
      { at: 95, zone: 'yellow', label: STAND_YELLOW },
      { at: 112, zone: 'green', label: 'Sita (grønt)' },
      { at: 157, zone: 'yellow', label: STAND_YELLOW },
      { at: 175, zone: 'green', label: 'Sita (grønt)' },
      { at: 234, zone: 'yellow', label: STAND_YELLOW },
    ]),
    item(
      'Teneri ean sea',
      'Feliks',
      'cooldown',
      undefined,
      [{ at: 0, zone: 'white', label: 'Pausa' }],
      { playSeconds: 120, note: 'Paususangur, 1 til 2 minuttir' },
    ),

    item('Everylittle thing', 'Carlene Carter', 'flat', 75, [
      { at: 0, zone: 'blue', label: SIT_BLUE },
      { at: 39, zone: 'green', label: STAND_GREEN },
      { at: 65, zone: 'blue', label: SIT_BLUE },
      { at: 92, zone: 'green', label: STAND_GREEN },
      { at: 119, zone: 'blue', label: SIT_BLUE },
      { at: 146, zone: 'green', label: STAND_GREEN },
    ]),
    item('Sweet but a psycho', 'Ava Max', 'flat', 67, [
      { at: 0, zone: 'green', label: SIT_GREEN },
      { at: 45, zone: 'green', label: STAND_GREEN },
      { at: 74, zone: 'green', label: SIT_GREEN },
      { at: 103, zone: 'green', label: STAND_GREEN },
      { at: 132, zone: 'green', label: SIT_GREEN },
      { at: 153, zone: 'green', label: STAND_GREEN },
    ]),
    item('That’s what makes you beautiful', 'One Direction', 'flat', 63, [
      { at: 0, zone: 'green', label: SIT_GREEN },
      { at: 31, zone: 'yellow', label: 'standa í gulum' },
      { at: 66, zone: 'green', label: SIT_GREEN },
      { at: 92, zone: 'yellow', label: 'standa í gulum' },
      { at: 128, zone: 'green', label: SIT_GREEN },
      { at: 158, zone: 'yellow', label: 'standa í gulum' },
    ]),
    item(
      'A bar song',
      'Shaboozey',
      'flat',
      81,
      [{ at: 0, zone: 'blue', label: 'Sita allan sangin' }],
      { note: 'Paususangur, hvítt ella blátt' },
    ),

    item('Not fair', 'Lily Allen', 'sprint', 61, [
      { at: 0, zone: 'blue', label: '61 í bláum' },
      { at: 39, zone: 'red', label: 'Spurta' },
      { at: 69, zone: 'blue', label: '61 í bláum' },
      { at: 102, zone: 'red', label: 'Spurta' },
      { at: 133, zone: 'blue', label: '61 í bláum' },
      { at: 166, zone: 'red', label: 'Spurta' },
    ]),
    item('Vinir eru reyðagull', 'Hallur og Kristina', 'sprint', 73, [
      { at: 0, zone: 'green', label: '73 í grønum' },
      { at: 43, zone: 'red', label: 'Spurta' },
      { at: 70, zone: 'green', label: '73 í grønum' },
      { at: 111, zone: 'red', label: 'Spurta' },
      { at: 138, zone: 'green', label: '73 í grønum' },
      { at: 153, zone: 'red', label: 'Spurta' },
      { at: 180, zone: 'green', label: '73 í grønum' },
    ]),

    item(
      'As it was',
      'Harry Styles',
      'flat',
      87,
      [{ at: 0, zone: 'blue', label: 'Sita allan sangin' }],
      { note: 'Paususangur' },
    ),
    item('Hvar Baby', 'Vágaverk', 'climb', 55, [{ at: 0, zone: 'yellow', label: 'Standa allan sangin' }]),
    item('Wellerman', 'Nathan Evans', 'flat', 81, [{ at: 0, zone: 'blue', label: 'Sita allan sangin' }], {
      note: 'Plan says Wallerman',
    }),
    item('4 minutes', 'Madonna, Timbaland og Justin Timberlake', 'climb', 57, [
      { at: 0, zone: 'yellow', label: 'Standa í gulum' },
      { at: 221, zone: 'red', label: 'Standa í reyðum' },
    ]),

    item(
      'Blinding lights',
      'The Weeknd',
      'cooldown',
      86,
      [{ at: 0, zone: 'blue', label: 'Sita allan sangin' }],
      { note: 'Paususangur, hvítt ella blátt' },
    ),

    item('Diggiloo Diggeley', 'Herreys', 'intervals', 66, [
      { at: 0, zone: 'green', label: 'Grønt' },
      { at: 67, zone: 'yellow', label: 'Gult' },
      { at: 127, zone: 'red', label: 'Reytt' },
    ]),
  ],
};

export const PLAN_TEMPLATES: PlanTemplate[] = [INNISUKKLING_240226];
