import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console
    console.error('🐛 ERROR CAUGHT BY BOUNDARY:', {
      message: error.message,
      stack: error.stack,
      component: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Store in sessionStorage for history
    try {
      const errorHistory = JSON.parse(sessionStorage.getItem('error_history') || '[]');
      errorHistory.push({
        message: error.message,
        stack: error.stack,
        component: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href
      });
      sessionStorage.setItem('error_history', JSON.stringify(errorHistory.slice(-5))); // Keep last 5
    } catch (e) {
      console.error('Failed to store error history:', e);
    }
  }

  getErrorReport = () => {
    const { error, errorInfo } = this.state;
    
    const report = `
═══════════════════════════════════════
🐛 MONEY TRACKER VN - ERROR REPORT
═══════════════════════════════════════
Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })} (Vietnam Time)
App Version: 1.7.7
Browser: ${navigator.userAgent}
URL: ${window.location.href}

Error Message:
${error?.message || 'Unknown error'}

Error Type:
${error?.name || 'Error'}

Stack Trace:
${error?.stack || 'No stack trace available'}

Component Stack:
${errorInfo?.componentStack || 'No component stack available'}

Session Info:
- User Agent: ${navigator.userAgent}
- Screen: ${window.screen.width}x${window.screen.height}
- Viewport: ${window.innerWidth}x${window.innerHeight}
- Online: ${navigator.onLine ? 'Yes' : 'No'}
═══════════════════════════════════════

Please send this report to support for debugging.
    `.trim();

    return report;
  };

  handleCopyError = async () => {
    try {
      const report = this.getErrorReport();
      await navigator.clipboard.writeText(report);
      this.setState({ copied: true });
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        this.setState({ copied: false });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy error:', err);
      alert('Failed to copy. Please manually select and copy the error details below.');
    }
  };

  handleGoHome = () => {
    this.setState({ 
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    });
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, copied } = this.state;
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="text-6xl mb-3">😕</div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                Oops! Something went wrong
              </h1>
              <p className="text-gray-600">
                We encountered an unexpected error. Don't worry, your data is safe.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <button
                onClick={this.handleCopyError}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  copied 
                    ? 'bg-green-500 text-white' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {copied ? (
                  <>
                    <span>✅</span>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span>Copy Error</span>
                  </>
                )}
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
              >
                <span>🏠</span>
                <span>Go Home</span>
              </button>
              
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                <span>🔄</span>
                <span>Reload</span>
              </button>
            </div>

            {/* Error Details (Expandable) */}
            <details className="bg-gray-50 rounded-lg p-4 cursor-pointer">
              <summary className="font-medium text-gray-700 select-none">
                📄 Error Details (for debugging)
              </summary>
              
              <div className="mt-4 space-y-4">
                {/* Simple Error Message */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Error Message:</div>
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 font-mono">
                    {error?.message || 'Unknown error'}
                  </div>
                </div>

                {/* Error Type */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Error Type:</div>
                  <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm text-orange-800 font-mono">
                    {error?.name || 'Error'}
                  </div>
                </div>

                {/* Stack Trace */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Stack Trace:</div>
                  <pre className="bg-gray-800 text-gray-100 rounded p-3 text-xs overflow-auto max-h-40 font-mono">
                    {error?.stack || 'No stack trace available'}
                  </pre>
                </div>

                {/* Component Stack */}
                {errorInfo?.componentStack && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Component Stack:</div>
                    <pre className="bg-gray-800 text-gray-100 rounded p-3 text-xs overflow-auto max-h-40 font-mono">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}

                {/* Session Info */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Session Info:</div>
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm space-y-1">
                    <div><strong>Time:</strong> {new Date().toLocaleString()}</div>
                    <div><strong>URL:</strong> {window.location.href}</div>
                    <div><strong>Online:</strong> {navigator.onLine ? '✅ Yes' : '❌ No'}</div>
                    <div><strong>Screen:</strong> {window.innerWidth}x{window.innerHeight}</div>
                  </div>
                </div>

                {/* Copy Instructions */}
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                  <div className="font-medium text-yellow-800 mb-1">📝 How to Report:</div>
                  <ol className="list-decimal list-inside text-yellow-700 space-y-1">
                    <li>Click "📋 Copy Error" button above</li>
                    <li>Paste in chat or email to support</li>
                    <li>Describe what you were doing when error occurred</li>
                  </ol>
                </div>
              </div>
            </details>

            {/* Help Text */}
            <div className="mt-4 text-center text-sm text-gray-500">
              <p>If this error persists, please contact support with the error details above.</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
