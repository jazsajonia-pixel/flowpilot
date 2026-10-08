import { Badge } from '@/components/ui/badge';
import { statusLabel, type ExecutionHistoryItem } from '@/lib/execution-api';

export function ExecutionStatusBadge({ item }: { item: Pick<ExecutionHistoryItem, 'status' | 'interrupted'> }) {
  const variant = item.interrupted || item.status === 'failed' ? 'destructive' : item.status === 'completed' ? 'success' : 'secondary';
  return <Badge variant={variant} className="text-[10px]">{statusLabel(item)}</Badge>;
}
