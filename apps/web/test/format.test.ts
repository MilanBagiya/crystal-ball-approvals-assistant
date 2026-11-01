import { itemCount } from '@/lib/format';

describe('itemCount', () => {
  it.each([
    [0, '0 items'],
    [1, '1 item'],
    [2, '2 items'],
    [4, '4 items'],
  ])('%i reads as "%s"', (n, expected) => {
    expect(itemCount(n)).toBe(expected);
  });
});
