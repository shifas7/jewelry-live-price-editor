const { useState, useEffect } = React;

function RefreshProgressModal({ jobId, onClose, onCancel, getRefreshStatus, cancelRefresh }) {
    const [status, setStatus] = useState(null);
    const [polling, setPolling] = useState(true);
    const [error, setError] = useState(null);

    // Format time in seconds to human readable
    const formatTime = (seconds) => {
        if (!seconds || seconds < 0) return 'Calculating...';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${minutes}m ${secs}s`;
    };

    // Poll for status updates
    useEffect(() => {
        if (!jobId || !polling) return;

        const pollStatus = async () => {
            try {
                const jobStatus = await getRefreshStatus(jobId);
                setStatus(jobStatus);

                // Stop polling if job is completed, failed, or cancelled
                if (['completed', 'failed', 'cancelled'].includes(jobStatus.status)) {
                    setPolling(false);
                }
            } catch (err) {
                console.error('Error polling status:', err);
                setError(err.message);
                setPolling(false);
            }
        };

        // Poll immediately
        pollStatus();

        // Then poll every 2 seconds
        const interval = setInterval(pollStatus, 2000);

        return () => clearInterval(interval);
    }, [jobId, polling, getRefreshStatus]);

    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [showFailedProducts, setShowFailedProducts] = useState(false);

    const handleCancel = () => {
        setShowCancelConfirm(true);
    };

    const confirmCancel = async () => {
        setShowCancelConfirm(false);
        try {
            await cancelRefresh(jobId);
            setPolling(false);
            alert('Job cancelled successfully');
            if (onCancel) {
                onCancel();
            }
        } catch (err) {
            console.error('Error cancelling job:', err);
            alert('Error: Failed to cancel job: ' + err.message);
        }
    };

    if (!status && !jobId) {
        return (
            <div className="modal">
                <div className="modal-content" style={{ maxWidth: '500px' }}>
                    <div className="modal-header">
                        <h2>🔄 Refreshing Product Prices</h2>
                    </div>
                    <div className="loading">
                        <p>Starting refresh job...</p>
                        <p style={{ fontSize: '14px', color: '#6d7175', marginTop: '8px' }}>
                            Please wait while we initialize the job...
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    
    if (!status && jobId) {
        return (
            <div className="modal">
                <div className="modal-content" style={{ maxWidth: '500px' }}>
                    <div className="modal-header">
                        <h2>🔄 Refreshing Product Prices</h2>
                    </div>
                    <div className="loading">
                        <p>Loading job status...</p>
                        <p style={{ fontSize: '14px', color: '#6d7175', marginTop: '8px' }}>
                            Job ID: {jobId}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const progress = status.progress || 0;
    const isComplete = status.status === 'completed';
    const isFailed = status.status === 'failed';
    const isCancelled = status.status === 'cancelled';
    const isProcessing = status.status === 'processing' || status.status === 'queued';

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>🔄 Refreshing Product Prices</h2>
                    {!isProcessing && (
                        <button className="close-btn" onClick={onClose}>×</button>
                    )}
                </div>

                {error && (
                    <div style={{
                        padding: '12px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        color: '#c33'
                    }}>
                        Error: {error}
                    </div>
                )}

                {isFailed && status.error && (
                    <div style={{
                        padding: '12px',
                        background: '#fee',
                        border: '1px solid #fcc',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        color: '#c33'
                    }}>
                        Job failed: {status.error}
                    </div>
                )}

                {isCancelled && (
                    <div style={{
                        padding: '12px',
                        background: '#ffe',
                        border: '1px solid #fc9',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        color: '#963'
                    }}>
                        Job was cancelled
                    </div>
                )}

                {/* Progress Bar */}
                <div style={{ marginBottom: '24px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px'
                    }}>
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>
                            {isComplete ? 'Completed' : isFailed ? 'Failed' : isCancelled ? 'Cancelled' : 'Processing'}
                        </span>
                        <span style={{ fontSize: '14px', color: '#6d7175' }}>
                            {progress}%
                        </span>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '24px',
                        background: '#e1e3e5',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: isComplete ? '#28a745' : isFailed ? '#dc3545' : isCancelled ? '#ffc107' : '#005bd3',
                            transition: 'width 0.3s ease',
                            borderRadius: '12px'
                        }} />
                    </div>
                </div>

                {/* Stats */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '16px',
                    marginBottom: '24px'
                }}>
                    <div style={{
                        padding: '16px',
                        background: '#f6f6f7',
                        borderRadius: '6px'
                    }}>
                        <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>
                            Products Processed
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '600' }}>
                            {status.processed || 0} / {status.total || 0}
                        </div>
                    </div>

                    <div style={{
                        padding: '16px',
                        background: '#f6f6f7',
                        borderRadius: '6px'
                    }}>
                        <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>
                            {isComplete ? 'Success Rate' : 'Success'}
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '600', color: '#28a745' }}>
                            {status.successCount || 0}
                        </div>
                    </div>

                    {status.failCount > 0 && (
                        <div style={{
                            padding: '16px',
                            background: '#f6f6f7',
                            borderRadius: '6px'
                        }}>
                            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>
                                Failed
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: '600', color: '#dc3545' }}>
                                {status.failCount || 0}
                            </div>
                        </div>
                    )}

                    {isProcessing && status.eta !== null && (
                        <div style={{
                            padding: '16px',
                            background: '#f6f6f7',
                            borderRadius: '6px'
                        }}>
                            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>
                                Estimated Time Remaining
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: '600' }}>
                                {formatTime(status.eta)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary (when completed) */}
                {isComplete && status.updates && (
                    <div style={{
                        marginTop: '24px',
                        padding: '16px',
                        background: '#f6f6f7',
                        borderRadius: '6px',
                        fontSize: '14px'
                    }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px' }}>Summary:</div>
                        <div>✓ {status.successCount} products updated successfully</div>
                        {status.failCount > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ color: '#dc3545', marginBottom: '8px' }}>
                                    ✗ {status.failCount} products failed to update
                                </div>
                                <button
                                    onClick={() => setShowFailedProducts(!showFailedProducts)}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #dc3545',
                                        color: '#dc3545',
                                        padding: '6px 12px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: '500'
                                    }}
                                >
                                    {showFailedProducts ? '▼ Hide' : '▶ Show'} Failed Products
                                </button>
                                {showFailedProducts && (() => {
                                    const failedProducts = status.updates.filter(u => !u.success);
                                    return (
                                        <div style={{
                                            marginTop: '12px',
                                            maxHeight: '300px',
                                            overflowY: 'auto',
                                            border: '1px solid #e1e3e5',
                                            borderRadius: '4px',
                                            background: '#fff'
                                        }}>
                                            <table style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '12px'
                                            }}>
                                                <thead>
                                                    <tr style={{
                                                        background: '#f6f6f7',
                                                        borderBottom: '1px solid #e1e3e5'
                                                    }}>
                                                        <th style={{
                                                            padding: '8px',
                                                            textAlign: 'left',
                                                            fontWeight: '600',
                                                            fontSize: '11px',
                                                            textTransform: 'uppercase',
                                                            color: '#6d7175'
                                                        }}>SKU</th>
                                                        <th style={{
                                                            padding: '8px',
                                                            textAlign: 'left',
                                                            fontWeight: '600',
                                                            fontSize: '11px',
                                                            textTransform: 'uppercase',
                                                            color: '#6d7175'
                                                        }}>Product</th>
                                                        <th style={{
                                                            padding: '8px',
                                                            textAlign: 'left',
                                                            fontWeight: '600',
                                                            fontSize: '11px',
                                                            textTransform: 'uppercase',
                                                            color: '#6d7175'
                                                        }}>Error</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {failedProducts.map((product) => (
                                                        <tr key={product.productId || product.sku || Math.random()} style={{
                                                            borderBottom: '1px solid #f6f6f7'
                                                        }}>
                                                            <td style={{
                                                                padding: '8px',
                                                                fontFamily: 'monospace',
                                                                fontSize: '11px',
                                                                color: '#6d7175'
                                                            }}>
                                                                {product.sku || 'N/A'}
                                                            </td>
                                                            <td style={{
                                                                padding: '8px',
                                                                maxWidth: '200px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {product.productTitle || 'Unknown'}
                                                            </td>
                                                            <td style={{
                                                                padding: '8px',
                                                                color: '#dc3545',
                                                                fontSize: '11px',
                                                                maxWidth: '300px',
                                                                wordBreak: 'break-word'
                                                            }}>
                                                                {product.error || 'Unknown error'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    paddingTop: '16px',
                    borderTop: '1px solid #e1e3e5'
                }}>
                    {isProcessing && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleCancel}
                        >
                            Cancel Job
                        </button>
                    )}
                    {!isProcessing && (
                        <button
                            className="btn btn-primary"
                            onClick={() => onClose && onClose(isComplete)}
                        >
                            {isComplete ? 'Done' : 'Close'}
                        </button>
                    )}
                </div>
            </div>

            {/* Cancel Confirmation Modal */}
            {showCancelConfirm && window.ConfirmModal && (
                <window.ConfirmModal
                    isOpen={showCancelConfirm}
                    title="Cancel Job"
                    message="Are you sure you want to cancel this job? The current progress will be lost."
                    onConfirm={confirmCancel}
                    onCancel={() => setShowCancelConfirm(false)}
                    confirmText="Yes, Cancel"
                    cancelText="No, Continue"
                    confirmButtonClass="btn-secondary"
                />
            )}
        </div>
    );
}

// Make available globally
window.RefreshProgressModal = RefreshProgressModal;

