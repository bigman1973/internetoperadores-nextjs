export function invoicePage<T>(items: readonly T[], requestedPage: number, pageSize = 50) {
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 200 ? pageSize : 50;
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, totalPages, total: items.length,
    from: items.length ? start + 1 : 0, to: Math.min(start + size, items.length) };
}
