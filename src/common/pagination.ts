export const ALLOWED_PAGE_LIMITS = [10, 20, 30, 40, 50] as const;

export type PaginationInput = {
  page?: number | string | null;
  limit?: number | string | null;
};

export type PaginationOptions = {
  page: number;
  limit: number;
  offset: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
};

export function normalizePaginationOptions(input: PaginationInput = {}): PaginationOptions {
  const rawPage = Number(input.page);
  const rawLimit = Number(input.limit);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const requestedLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 10;
  const limit = ALLOWED_PAGE_LIMITS.find((allowedLimit) => requestedLimit <= allowedLimit) ?? 50;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  options: PaginationOptions,
): PaginatedResponse<T> {
  const totalPages = total > 0 ? Math.ceil(total / options.limit) : 0;

  return {
    data,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      total_pages: totalPages,
      has_next_page: options.page < totalPages,
      has_previous_page: options.page > 1,
    },
  };
}

export async function paginateQuery<T>(
  dataQuery: { limit: (limit: number) => any; offset: (offset: number) => any },
  countQuery: { executeTakeFirst: () => Promise<Record<string, any> | undefined> },
  input: PaginationInput = {},
): Promise<PaginatedResponse<T>> {
  const options = normalizePaginationOptions(input);
  const [data, countRow] = await Promise.all([
    dataQuery.limit(options.limit).offset(options.offset).execute(),
    countQuery.executeTakeFirst(),
  ]);
  const total = Number(countRow?.total ?? countRow?.count ?? 0);

  return buildPaginatedResponse<T>(data, Number.isFinite(total) ? total : 0, options);
}
