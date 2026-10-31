import { GreetingSchema } from '@approvals/contracts';
import { buildGreetingTemplate, partOfDay } from '../../src/domain/greetingTemplate';
import { makeItem, seedApprovals } from '../fixtures/approvals';

describe('partOfDay', () => {
  it.each([
    ['05:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['16:59', 'afternoon'],
    ['17:00', 'evening'],
    ['23:30', 'evening'],
    ['04:59', 'evening'],
  ])('treats %s as %s', (time, expected) => {
    expect(partOfDay(time)).toBe(expected);
  });

  it('is undefined without a local time', () => {
    expect(partOfDay(undefined)).toBeUndefined();
  });
});

describe('buildGreetingTemplate', () => {
  it('greets the seeded queue with the count and the safety item', () => {
    expect(buildGreetingTemplate({ items: seedApprovals(), localTime: '14:05' })).toBe(
      'Good afternoon! You have 4 items waiting for review, including 1 safety document.',
    );
  });

  it('says Hello when the local time is unknown', () => {
    expect(buildGreetingTemplate({ items: seedApprovals() })).toMatch(/^Hello! You have 4 items/);
  });

  it('uses singular forms for one item', () => {
    expect(buildGreetingTemplate({ items: [makeItem({ title: 'Camera map' })], localTime: '09:00' })).toBe(
      'Good morning! You have 1 item waiting for review.',
    );
  });

  it('pluralises safety documents and omits the clause when there are none', () => {
    const twoSafety = [makeItem({ title: 'Hazard log' }), makeItem({ title: 'Sensor specs' })];

    expect(buildGreetingTemplate({ items: twoSafety })).toContain('including 2 safety documents.');
    expect(buildGreetingTemplate({ items: [makeItem({ title: 'Camera map' })] })).not.toContain('safety');
  });

  it('counts only pending items and says when the queue is clear', () => {
    const approved = makeItem({ title: 'Hazard log', status: 'approved' });

    expect(buildGreetingTemplate({ items: [approved], localTime: '19:00' })).toBe(
      'Good evening! Your review queue is clear.',
    );
  });

  it('always fits GreetingSchema, so the template is a safe fallback', () => {
    const many = Array.from({ length: 250 }, (_, i) => makeItem({ title: `Safety sheet ${i}` }));

    expect(GreetingSchema.safeParse({ greeting: buildGreetingTemplate({ items: many }) }).success).toBe(true);
  });
});
