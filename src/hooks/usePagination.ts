import { useEffect, useMemo, useState } from 'react';

// Client-side pagination for an already-filtered array — every list view
// in this app filters/sorts in memory after one fetch, so slicing the
// rendered page here (rather than re-querying Supabase per page) keeps
// every existing search/filter/sort untouched.
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // A new search/filter can shrink the list out from under the page the
  // admin was already looking at — snap back to the last valid page
  // instead of showing a stranded empty page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage, totalPages, pageItems, totalItems: items.length };
}
