/**
 * Returns an array of page numbers and ellipses (represented as '...') for pagination.
 * @param {number} currentPage - The current active page (1-indexed)
 * @param {number} totalPages - The total number of pages
 * @returns {Array<number|string>} Array containing page numbers and '...' for ellipsis
 */
export function getPageWindow(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...set]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) {
      result.push('...');
    }
    result.push(p);
  });
  return result;
}