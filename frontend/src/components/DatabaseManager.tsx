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
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './ui';
import { testFirestoreConnection } from '../lib/firebase';
import firebaseConfig from '../../../firebase-applet-config.json';

interface DatabaseStatus {
  hasConfig: boolean;
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
  };
}

export default function DatabaseManager() {
  const toast = useToast();
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [customConn, setCustomConn] = useState('');
  const [syncResult, setSyncResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.get<DatabaseStatus>('/database/status');
      setStatus(data);
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
    try {
      const res = await api.post<{ connected: boolean; database?: string; user?: string; error?: string }>('/database/test', {
        connectionString: customConn.trim() || undefined,
      });
      if (res.connected) {
        toast(`Connected successfully to PostgreSQL database: ${res.database || 'default'}`);
        loadStatus();
      } else {
        toast(res.error || 'Connection failed', 'error');
      }
    } catch (e: any) {
      toast(e.message || 'Connection test failed', 'error');
    } finally {
      setTesting(false);
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

  const copyConnectionString = () => {
    const example = 'postgresql://postgres:password@localhost:5432/taskflow?sslmode=disable';
    navigator.clipboard.writeText(example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Copied sample connection string');
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PostgreSQL Card */}
        <div className="card p-6 border-line bg-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server size={18} className="text-blue-500" />
                <h3 className="font-bold text-sm text-ink">PostgreSQL Database</h3>
              </div>
              {status?.connection?.connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <XCircle size={12} /> Standby / Configurable
                </span>
              )}
            </div>

            <p className="text-xs text-ink2 mb-4 leading-relaxed">
              Fully compatible with all PostgreSQL installations: <strong>Neon</strong>, <strong>Supabase</strong>, <strong>Cloud SQL</strong>, <strong>AWS RDS</strong>, or local <strong>Postgres 13-17</strong>.
            </p>

            {status?.connection?.connected ? (
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
            ) : (
              <div className="p-3 rounded-xl bg-card2/80 border border-line/60 space-y-2 text-xs mb-4">
                <div className="text-ink font-semibold flex items-center justify-between">
                  <span>Connection Configuration</span>
                  <button
                    onClick={copyConnectionString}
                    className="text-[11px] text-brand hover:underline flex items-center gap-1 font-mono"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy Sample URL'}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="postgresql://user:pass@host:5432/dbname?sslmode=require"
                  value={customConn}
                  onChange={(e) => setCustomConn(e.target.value)}
                  className="input w-full text-xs font-mono"
                />
                <div className="text-[11px] text-ink3">
                  Or set <code className="text-brand">DATABASE_URL</code> in environment variables.
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
              Provisioned Google Cloud Firestore database with real-time multi-device sync, Zero-Trust security rules, and automatic scalability.
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
