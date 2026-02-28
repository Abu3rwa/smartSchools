import { TextField } from '@mui/material';

const NotesFields = ({ principalNote, materialsLink, onPrincipalNoteChange, onMaterialsLinkChange }) => (
  <>
    <TextField
      fullWidth
      multiline
      rows={3}
      label="Principal Note"
      placeholder="Optional note for the substitute teacher..."
      value={principalNote}
      onChange={onPrincipalNoteChange}
      sx={{ mb: 2, maxWidth: 600 }}
    />

    <TextField
      fullWidth
      label="Materials Link"
      placeholder="Optional link to lesson plans, materials, or resources..."
      value={materialsLink}
      onChange={onMaterialsLinkChange}
      sx={{ mb: 2, maxWidth: 600 }}
    />
  </>
);

export default NotesFields;