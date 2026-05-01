import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Không tìm thấy trang</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        Route này không tồn tại trong workspace hiện tại.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Quay về thư viện dữ liệu
      </Link>
    </div>
  );
}
