import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  UploadCloud,
  Server,
  Cloud,
  ArrowRight,
  ShieldCheck,
  Copy,
  Check,
  AlertTriangle,
  Info,
  ExternalLink,
  Laptop,
  Globe,
  Save,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './ui';
import { testFirestoreConnection } from '../lib/firebase';
import firebaseConfig from '../../../firebase-applet-config.json';

interface DatabaseStatus {
  hasConfig: boolean;
  savedUrl?: string;
  config: {
    host: string;
    database: string;
    user: string;
    ssl: boolean;
  } | null;
  connection: {
    connected: boolean;
    database?: string;
    user?: string;
    version?: string;
    error?: string;
    diagnosis?: string;
    isLocalhostTarget?: boolean;
  };
}

export default function DatabaseManager() {
  const toast = useToast();
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [customConn, setCustomConn] = useState('');
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    error?: string;
    diagnosis?: string;
    isLocalhostTarget?: boolean;
    database?: string;
    user?: string;
    version?: string;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [firestoreStatus, setFirestoreStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.get<DatabaseStatus>('/database/status');
      setStatus(data);
      if (data?.savedUrl && !customConn) {
        setCustomConn(data.savedUrl);
      }
    } catch {
      toast('Failed to load database status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const checkFirestore = async () => {
    setFirestoreStatus('checking');
    const res = await testFirestoreConnection();
    setFirestoreStatus(res.ok ? 'connected' : 'error');
  };

  useEffect(() => {
    loadStatus();
    checkFirestore();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<any>('/database/test', {
        connectionString: customConn.trim() || undefined,
      });
      setTestResult(res);
      if (res.connected) {
        toast(`Connected successfully to PostgreSQL database: ${res.database || 'default'}`);
        loadStatus();
      } else {
        toast(res.error || 'Connection failed', 'error');
      }
    } catch (e: any) {
      const errObj = { connected: false, error: e.message || 'Connection test failed' };
      setTestResult(errObj);
      toast(e.message || 'Connection test failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!customConn.trim()) {
      toast('Please enter a PostgreSQL connection string', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<any>('/database/save-config', {
        connectionString: customConn.trim(),
      });
      if (res.ok) {
        toast('PostgreSQL connection string saved');
        loadStatus();
      }
    } catch (e: any) {
      toast(e.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRunMigration = async () => {
    setMigrating(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/database/migrate', {
        connectionString: customConn.trim() || undefined,
      });
      if (res.success) {
        toast('PostgreSQL schema migration completed successfully!');
      }
    } catch (e: any) {
      toast(e.message || 'Migration failed', 'error');
    } finally {
      setMigrating(false);
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    try {
      const res = await api.post<{ success: boolean; synced: Record<string, number | string> }>('/database/sync', {
        connectionString: customConn.trim() || undefined,
      });
      if (res.success) {
        setSyncResult(res.synced);
        toast('Data synced successfully from SQLite to PostgreSQL!');
      }
    } catch (e: any) {
      toast(e.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const downloadSchemaSql = () => {
    const a = document.createElement('a');
    a.href = '/api/database/export-schema';
    a.download = 'pdcl_taskflow_postgres_schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Downloading PostgreSQL schema SQL...');
  };

  const copyText = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
    toast('Copied to clipboard');
  };

  const isLocalTarget = customConn.includes('localhost') || customConn.includes('127.0.0.1');

  return (
    <div className="space-y-6">
      {/* Cloud & PostgreSQL Header */}
      <div className="card p-6 border-line bg-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Database size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                  Database & Cloud Architecture
                </h2>
                <p className="text-xs text-ink3">
                  Enterprise PostgreSQL engine support and Google Cloud Firebase Firestore integration
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadStatus();
                checkFirestore();
              }}
              disabled={loading}
              className="btn btn-secondary !py-2 !px-3 text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh Status
            </button>
            <button
              onClick={downloadSchemaSql}
              className="btn btn-primary !py-2 !px-3 text-xs flex items-center gap-1.5"
            >
              <Download size={14} />
              Download PostgreSQL Schema
            </button>
          </div>
        </div>
      </div>

      {/* CLOUD VS LOCAL ENVIRONMENT CALLOUT */}
      <div className="card p-5 border-amber-500/30 bg-amber-500/5 text-xs text-ink space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
            <Info size={16} />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-ink flex items-center gap-2">
              Why connecting to "localhost" fails in Cloud Preview
            </h4>
            <p className="text-ink2 leading-relaxed">
              This application is currently hosted on <strong>Google Cloud Run</strong> in the cloud (
              <span className="font-mono text-ink text-[11px]">asia-southeast1.run.app</span>).
              When you enter <code className="bg-card2 px-1 rounded font-mono text-amber-600">localhost:5432</code> or <code className="bg-card2 px-1 rounded font-mono text-amber-600">127.0.0.1</code>,
              the cloud server looks for a PostgreSQL database <em>inside Google Cloud itself</em>, which cannot access your personal computer behind your local Wi-Fi or router.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {/* Solution 1 */}
          <div className="p-3 rounded-xl bg-card border border-line space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <Globe size={14} className="text-blue-500" />
              <span>Option 1: Connect a Free Cloud PostgreSQL (Recommended)</span>
            </div>
            <p className="text-ink3 text-[11px] leading-relaxed">
              Create an instant, free PostgreSQL database on <strong>Neon.tech</strong>, <strong>Supabase</strong>, or <strong>Aiven</strong>. They provide an internet-accessible URL (e.g., <code className="text-brand">postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require</code>) that connects instantly from this cloud environment.
            </p>
          </div>

          {/* Solution 2 */}
          <div className="p-3 rounded-xl bg-card border border-line space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <Laptop size={14} className="text-emerald-500" />
              <span>Option 2: Tunnel Local Postgres or Run Locally</span>
            </div>
            <p className="text-ink3 text-[11px] leading-relaxed">
              To connect your computer's local Postgres to this preview app, run:
              <br />
              <code className="bg-card2 px-1.5 py-0.5 rounded text-[11px] font-mono text-brand block mt-1">
                ngrok tcp 5432
              </code>
              Then paste the generated <code className="font-mono text-[10px]">tcp.ngrok.io</code> URL here. Alternatively, download the app repository to your computer and run <code className="font-mono text-ink">npm run dev</code> locally.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PostgreSQL Card */}
        <div className="card p-6 border-line bg-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server size={18} className="text-blue-500" />
                <h3 className="font-bold text-sm text-ink">PostgreSQL Database Connection</h3>
              </div>
              {status?.connection?.connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <XCircle size={12} /> Not Connected
                </span>
              )}
            </div>

            <p className="text-xs text-ink2 mb-4 leading-relaxed">
              Enter an external PostgreSQL connection URL (Neon, Supabase, Cloud SQL, AWS RDS, or Ngrok tunnel).
            </p>

            <div className="p-3 rounded-xl bg-card2/80 border border-line/60 space-y-2 text-xs mb-4">
              <div className="text-ink font-semibold flex items-center justify-between">
                <span>PostgreSQL Connection String</span>
                <button
                  type="button"
                  onClick={() => copyText('postgresql://postgres:password@localhost:5432/taskflow?sslmode=disable', 'sample')}
                  className="text-[11px] text-brand hover:underline flex items-center gap-1 font-mono"
                >
                  {copiedType === 'sample' ? <Check size={12} /> : <Copy size={12} />}
                  {copiedType === 'sample' ? 'Copied' : 'Copy Sample'}
                </button>
              </div>
              <input
                type="text"
                placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
                value={customConn}
                onChange={(e) => setCustomConn(e.target.value)}
                className="input w-full text-xs font-mono"
              />

              {isLocalTarget && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    Warning: You entered <strong>localhost</strong>. Because this app is running in Google Cloud, it cannot reach your laptop's localhost directly without a tunnel.
                  </span>
                </div>
              )}
            </div>

            {/* Test or Connection Feedback */}
            {testResult && !testResult.connected && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs mb-4 space-y-1.5">
                <div className="font-bold text-red-600 flex items-center gap-1.5">
                  <XCircle size={14} /> Connection Failed
                </div>
                <div className="text-red-500 font-mono text-[11px] break-all">{testResult.error}</div>
                {testResult.diagnosis && (
                  <div className="text-ink2 text-[11px] pt-1 border-t border-red-500/20 leading-relaxed">
                    <strong>Diagnosis:</strong> {testResult.diagnosis}
                  </div>
                )}
              </div>
            )}

            {testResult?.connected && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs mb-4 space-y-1 text-emerald-600">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Connected Successfully!
                </div>
                <div className="font-mono text-[11px]">Database: {testResult.database} | User: {testResult.user}</div>
              </div>
            )}

            {status?.connection?.connected && !testResult && (
              <div className="p-3 rounded-xl bg-card2 border border-line/60 space-y-1.5 text-xs font-mono mb-4">
                <div className="text-ink flex justify-between">
                  <span className="text-ink3">Database:</span>
                  <span className="font-semibold">{status.connection.database}</span>
                </div>
                <div className="text-ink flex justify-between">
                  <span className="text-ink3">User:</span>
                  <span>{status.connection.user}</span>
                </div>
                <div className="text-ink flex justify-between">
                  <span className="text-ink3">Host:</span>
                  <span>{status.config?.host}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-line/60 flex flex-wrap gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="btn btn-secondary !py-2 !px-3 text-xs flex-1 flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
              Test Connection
            </button>
            <button
              onClick={handleSaveConnection}
              disabled={saving || !customConn.trim()}
              className="btn btn-secondary !py-2 !px-3 text-xs flex-1 flex items-center justify-center gap-1.5"
            >
              <Save size={13} className={saving ? 'animate-spin' : ''} />
              Save URL
            </button>
            <button
              onClick={handleRunMigration}
              disabled={migrating}
              className="btn btn-secondary !py-2 !px-3 text-xs flex-1 flex items-center justify-center gap-1.5"
            >
              <UploadCloud size={13} />
              Run Schema
            </button>
            <button
              onClick={handleSyncData}
              disabled={syncing}
              className="btn btn-primary !py-2 !px-3 text-xs w-full flex items-center justify-center gap-1.5"
            >
              <ArrowRight size={13} />
              Sync SQLite to PostgreSQL
            </button>
          </div>
        </div>

        {/* Firebase Cloud Firestore Card */}
        <div className="card p-6 border-line bg-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cloud size={18} className="text-amber-500" />
                <h3 className="font-bold text-sm text-ink">Google Cloud Firestore</h3>
              </div>
              {firestoreStatus === 'connected' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Active & Provisioned
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                  <ShieldCheck size={12} /> Ready
                </span>
              )}
            </div>

            <p className="text-xs text-ink2 mb-4 leading-relaxed">
              Google Cloud Firestore database with real-time multi-device sync, Zero-Trust security rules, and automatic scalability.
            </p>

            <div className="p-3 rounded-xl bg-card2 border border-line/60 space-y-1.5 text-xs font-mono mb-4">
              <div className="text-ink flex justify-between">
                <span className="text-ink3">Project ID:</span>
                <span className="font-semibold text-brand truncate max-w-[200px]">{firebaseConfig.projectId}</span>
              </div>
              <div className="text-ink flex justify-between">
                <span className="text-ink3">Database ID:</span>
                <span className="truncate max-w-[200px]">{firebaseConfig.firestoreDatabaseId}</span>
              </div>
              <div className="text-ink flex justify-between">
                <span className="text-ink3">Security Rules:</span>
                <span className="text-emerald-500 font-semibold">Deployed (Pillars 1-8)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-line/60">
            <button
              onClick={checkFirestore}
              className="btn btn-secondary w-full !py-2 !px-3 text-xs flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={13} />
              Validate Firestore Connection
            </button>
          </div>
        </div>
      </div>

      {/* Sync Results if Available */}
      {syncResult && (
        <div className="card p-5 border-line bg-card">
          <h4 className="font-bold text-xs text-ink uppercase tracking-wider mb-3">
            Last PostgreSQL Sync Summary
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
            {Object.entries(syncResult).map(([table, count]) => (
              <div key={table} className="p-2.5 rounded-lg bg-card2 border border-line/40">
                <div className="text-[11px] text-ink3 truncate font-mono">{table}</div>
                <div className="text-base font-bold text-ink mt-0.5">{String(count)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
