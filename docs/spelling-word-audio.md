# Spelling audio moderation

Teachers and administrators can open **Spelling → Manage spelling audio** to search for a spelling word and listen to its example recordings.

Use **Replace link** to enter a new recording URL, listen to its preview, and confirm the replacement. Or use **Remove** for an example that should no longer be played. Both actions permanently change that dictionary's example URL in the shared spelling audio record for the word, so the change affects every school. Pronunciation recordings and examples from other dictionaries are left unchanged.

Replacement links must use HTTPS and come from Longman, Oxford Learner's Dictionaries, or Merriam-Webster, the same approved providers used by spelling audio imports.

The spelling word must exist in the current school's word list to appear in search. Audio import and per-grade audio settings remain administrator-only.

## AI pronunciation management

Pronunciation in spelling comes only from generated AI clips; dictionary pronunciation URLs are no longer played, edited, imported, or exported by spelling. Example-sentence recordings above are unaffected.

On the same page, each word shows its AI US and AI UK clips with **Test playback**, **Regenerate**, and **Remove** actions (administrators only, enforced on the server):

- **Remove** stops the clip from being served to every school and blocks automatic recreation. The word keeps its other accent. Students fall back to the browser voice for the removed accent until an admin regenerates it.
- **Regenerate** creates a genuinely new clip and replaces the old one only after generation succeeds. The clip gets a new address, so browsers that cached the old one fetch the new recording. Generation follows the platform AI word audio switch and is charged to the school's AI credits like other generation.
- Both actions confirm first and explain that AI clips are shared across schools, so a change affects every school using the word.

Removed clips appear per grade in the AI coverage table and are excluded from bulk generation and its cost estimate. See `spelling-audio-migration.md` for the stored-data plan.
