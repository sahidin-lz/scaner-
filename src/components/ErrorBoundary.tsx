import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedInfo: Record<string, unknown> | null = null;
      try {
        parsedInfo = JSON.parse(this.state.errorMessage);
      } catch {
        parsedInfo = null;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">Terjadi Kendala Akses Data</h2>
            </div>

            {parsedInfo ? (
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  Operasi <span className="font-mono font-semibold">{String(parsedInfo.operationType)}</span> pada
                  jalur <span className="font-mono font-semibold">{String(parsedInfo.path)}</span> ditolak atau gagal.
                </p>
                <pre className="p-3 bg-slate-100 rounded-lg text-xs font-mono overflow-x-auto text-slate-700">
                  {JSON.stringify(parsedInfo, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-slate-600">{this.state.errorMessage}</p>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
