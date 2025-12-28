const { useState, useEffect } = React;

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel', confirmButtonClass = 'btn-primary' }) {
    if (!isOpen) return null;

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onCancel();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onCancel]);

    return (
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '450px' }}>
                <div className="modal-header">
                    <h2>{title || 'Confirm'}</h2>
                </div>
                <div style={{ padding: '20px' }}>
                    <p style={{ marginBottom: '24px', fontSize: '14px', color: '#202223' }}>
                        {message}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={onCancel}
                        >
                            {cancelText}
                        </button>
                        <button
                            className={`btn ${confirmButtonClass}`}
                            onClick={onConfirm}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Make available globally
window.ConfirmModal = ConfirmModal;

