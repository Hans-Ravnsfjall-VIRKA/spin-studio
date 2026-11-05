import { describe, expect, it } from 'vitest';
import { INNISUKKLING_240226 } from '../data/plans';
import { INNISUKKLING_TEXT } from './fixtures/innisukklingText';
import { itemsToLines, parsePlanText, zonesIn } from './planPdfModel';

describe('zonesIn', () => {
  it('finds Faroese zone words in any form', () => {
    expect(zonesIn('sita í bláum')).toEqual(['blue']);
    expect(zonesIn('standa (gult)')).toEqual(['yellow']);
    expect(zonesIn('í hvítum ella bláum')).toEqual(['white', 'blue']);
    expect(zonesIn('reyðum')).toEqual(['red']);
    expect(zonesIn('reytt')).toEqual(['red']);
    expect(zonesIn('spurta')).toEqual(['red']);
    expect(zonesIn('grønt')).toEqual(['green']);
    expect(zonesIn('sita allan sangin')).toEqual([]);
  });
});

describe('parsePlanText on the Innisúkkling PDF', () => {
  const plan = parsePlanText(INNISUKKLING_TEXT, 'x');

  it('finds the name and all 17 songs', () => {
    expect(plan?.name).toBe('Innisúkkling 240226');
    expect(plan?.items).toHaveLength(17);
  });

  it('reads titles, artists and wrapped names', () => {
    const it = plan?.items ?? [];
    expect(it[0]).toMatchObject({ title: 'Alla nátt', artist: 'Hjarnar' });
    expect(it[1]).toMatchObject({ title: 'Stor mand', artist: 'Tobias Rahim feat. Andreas Odbjerg' });
    expect(it[14].artist).toBe('Madonna, Timbaland og Justin Timberlake');
    expect(it[16]).toMatchObject({ title: 'Diggiloo Diggeley', artist: 'Herreys' });
  });

  it('matches the hand-entered plan for RPM, start times and zones', () => {
    const parsed = plan?.items ?? [];
    INNISUKKLING_240226.items.forEach((hand, i) => {
      const p = parsed[i];
      expect(p.title.toLowerCase(), `title ${i + 1}`).toBe(hand.title.toLowerCase().replace('wellerman', 'wallerman'));
      expect(p.custom.rpm, `rpm ${i + 1}`).toBe(hand.custom.rpm);
      expect(p.custom.cues.map((c) => c.at), `starts ${i + 1}`).toEqual(hand.custom.cues.map((c) => c.at));
      expect(p.custom.cues.map((c) => c.zone), `zones ${i + 1}`).toEqual(hand.custom.cues.map((c) => c.zone));
      expect(p.custom.playSeconds, `play ${i + 1}`).toBe(hand.custom.playSeconds);
    });
  });

  it('builds sit and stand labels from the plan wording', () => {
    const song6 = plan?.items[5].custom.cues.map((c) => c.label);
    expect(song6?.[0]).toBe('Sita í bláum');
    expect(song6?.[1]).toBe('Standa í grønum');
    const song15 = plan?.items[14].custom.cues.map((c) => c.label);
    expect(song15).toEqual(['Standa í gulum', 'Standa í reyðum']);
  });

  it('returns null for text with no songs', () => {
    expect(parsePlanText('hello\nworld')).toBeNull();
  });
});

describe('itemsToLines', () => {
  it('orders rows top down and pieces left to right', () => {
    const lines = itemsToLines([
      { str: 'b', x: 50, y: 700 },
      { str: 'a', x: 10, y: 700.5 },
      { str: 'second', x: 10, y: 650 },
      { str: ' ', x: 0, y: 600 },
    ]);
    expect(lines).toEqual(['a b', 'second']);
  });

  it('joins pieces that touch and spaces the ones that do not', () => {
    const lines = itemsToLines([
      { str: 'Stor', x: 10, y: 500, width: 20 },
      { str: 'mand', x: 30, y: 500, width: 20 },
      { str: 'and', x: 60, y: 500, width: 15 },
    ]);
    expect(lines).toEqual(['Stormand and']);
  });
});
