import type { SearchRequest, SearchResult } from '@re-send/shared';
import { request } from './client';

/** Search inside documents and emails (a POST: the words stay out of URLs). */
export function searchFiles(body: SearchRequest): Promise<SearchResult> {
  return request('/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
