import { Link } from 'react-router-dom';
import { CompassIcon } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <CompassIcon className="h-16 w-16 text-[var(--foreground)]/20 mb-4" />
      <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Page not found</h1>
      <p className="text-[var(--foreground)]/60 mb-6 max-w-sm">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link to="/">
        <Button variant="primary">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
