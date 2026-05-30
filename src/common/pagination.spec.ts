import { normalizePaginationOptions } from './pagination';

describe('pagination helpers', () => {
  it('defaults to page 1 and limit 10', () => {
    expect(normalizePaginationOptions()).toEqual({
      page: 1,
      limit: 10,
      offset: 0,
    });
  });

  it('allows only configured page sizes up to 50', () => {
    expect(normalizePaginationOptions({ page: 3, limit: 30 })).toEqual({
      page: 3,
      limit: 30,
      offset: 60,
    });
    expect(normalizePaginationOptions({ page: 2, limit: 999 })).toEqual({
      page: 2,
      limit: 50,
      offset: 50,
    });
  });

  it('rounds unsupported limits up to the next allowed size', () => {
    expect(normalizePaginationOptions({ page: 1, limit: 11 })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    });
  });
});
