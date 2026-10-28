/**
 * The server sends stable action and stage keys; the interface supplies the words
 * so a student reading Arabic gets Arabic, not an English sentence from the API.
 */

export const actionKey = ({ stage, action }) => {
  if (action === 'wait') {
    if (stage === 'awaiting_notebook_check') return 'waitingForNotebookCheck';
    return 'teacherReviewing';
  }
  if (action === 'revise') return 'revise';
  if (action === 'notebook') return 'notebook';
  if (action === 'done') return 'done';
  if (action === 'start') return 'start';
  return 'continue';
};
