/**
 * Undo / Redo Manager
 */

const historyManager = {
    stack: [],
    index: -1,
    limit: 20,
    isProcessing: false,

    push(canvas) {
        if (this.isProcessing) return;

        const json = JSON.stringify(canvas.toJSON());

        // If we are in the middle of history, clear forward states
        if (this.index < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.index + 1);
        }

        this.stack.push(json);
        if (this.stack.length > this.limit) {
            this.stack.shift();
        } else {
            this.index++;
        }

        this.updateButtons();
    },

    undo(canvas) {
        if (this.index > 0) {
            this.isProcessing = true;
            this.index--;
            this.loadState(canvas);
        }
    },

    redo(canvas) {
        if (this.index < this.stack.length - 1) {
            this.isProcessing = true;
            this.index++;
            this.loadState(canvas);
        }
    },

    loadState(canvas) {
        const state = this.stack[this.index];
        canvas.loadFromJSON(state, () => {
            canvas.renderAll();
            this.isProcessing = false;
            this.updateButtons();
        });
    },

    clear() {
        this.stack = [];
        this.index = -1;
        this.updateButtons();
    },

    updateButtons() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        if (btnUndo) btnUndo.disabled = this.index <= 0;
        if (btnRedo) btnRedo.disabled = this.index >= this.stack.length - 1;
    }
};

// Bind UI actions
document.getElementById('btn-undo').addEventListener('click', () => historyManager.undo(canvas));
document.getElementById('btn-redo').addEventListener('click', () => historyManager.redo(canvas));

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
            e.preventDefault();
            historyManager.undo(canvas);
        } else if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) {
            e.preventDefault();
            historyManager.redo(canvas);
        }
    }
});
