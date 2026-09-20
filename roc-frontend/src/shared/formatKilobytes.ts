const BYTES_PER_KILOBYTE = 1024;

const kilobyteFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatKilobytes(bytes: number): string {
  return `${kilobyteFormatter.format(bytes / BYTES_PER_KILOBYTE)} KB`;
}
