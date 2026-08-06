import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card">
        <div className="hairline-b flex items-center justify-between bg-header px-4 py-3">
          <h1 className="text-sm font-semibold text-foreground">Không tìm thấy trang</h1>
          <span className="font-mono text-xs text-foreground-tertiary">404</span>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Mã phòng không hợp lệ, hoặc đường dẫn này không tồn tại. Mã phòng chỉ gồm chữ thường,
            số và dấu gạch ngang.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
