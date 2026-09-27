import { asyncHandler } from '../middleware/errorHandler.js';
import { getDictionaryEntry } from '../services/dictionaryService.js';

export const getDictionaryWord = asyncHandler(async (req, res) => {
    const data = await getDictionaryEntry(req.params.word);
    return res.json({ success: true, data });
});
