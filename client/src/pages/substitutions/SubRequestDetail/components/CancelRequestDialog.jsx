import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Button } from '@mui/material';

const CancelRequestDialog = ({ open, onClose, onConfirm, note, onNoteChange, cancelling }) => (
  <Dialog open={open} onClose={() => !cancelling && onClose()}>
    <DialogTitle>Cancel Substitution Request</DialogTitle>
    <DialogContent>
      <TextField
        fullWidth
        multiline
        rows={2}
        label="Note (optional)"
        value={note}
        onChange={onNoteChange}
        disabled={cancelling}
        sx={{ mt: 1 }}
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={() => !cancelling && onClose()} disabled={cancelling}>
        Close
      </Button>
      <Button color="error" onClick={onConfirm} disabled={cancelling}>
        {cancelling ? 'Cancelling...' : 'Cancel Request'}
      </Button>
    </DialogActions>
  </Dialog>
);

export default CancelRequestDialog;