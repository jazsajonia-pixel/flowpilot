import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteDataRecord, listDataCollections, listDataRecords, type DataCollectionSummary, type DataRecordSummary } from '@/lib/data-api';

export function DataPage() {
  const [collections, setCollections] = useState<DataCollectionSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<DataRecordSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listDataCollections();
      setCollections(next);
      setSelected((current) => (current && next.some((item) => item.name === current) ? current : next[0]?.name ?? null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCollections(); }, [loadCollections]);
  useEffect(() => {
    if (!selected) { setRecords([]); return; }
    listDataRecords(selected).then(setRecords).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Records could not be loaded.'));
  }, [selected]);

  async function remove(key: string) {
    if (!selected || !window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await deleteDataRecord(selected, key);
      setRecords((current) => current.filter((record) => record.key !== key));
      void loadCollections();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Record could not be deleted.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Data</h2>
          <p className="text-sm text-muted-foreground">Private JSON records saved by Create and Update Database Record steps.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadCollections()} className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>
      {error && <p className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive" role="alert">{error}</p>}
      {!loading && collections.length === 0 && !error && (
        <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><Database className="h-5 w-5" /> No records yet. Add a Create Database Record step to a workflow and run it.</CardContent></Card>
      )}
      {collections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {collections.map((collection) => (
            <Button key={collection.name} size="sm" variant={collection.name === selected ? 'default' : 'outline'} onClick={() => setSelected(collection.name)}>
              {collection.name} · {collection.count}
            </Button>
          ))}
        </div>
      )}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected}</CardTitle>
            <CardDescription>Showing up to the 100 most recently updated records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {records.map((record) => (
              <div key={record.key} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold" title={record.key}>{record.key}</p>
                    <p className="text-[10px] text-muted-foreground">Updated {new Date(record.updatedAt).toLocaleString()}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Delete record" onClick={() => void remove(record.key)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-4">{JSON.stringify(record.data, null, 2)}</pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
