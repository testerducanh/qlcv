/** Bỏ dấu tiếng Việt và hạ chữ thường, để gõ "bao cao" vẫn tìm ra "Báo cáo". */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}