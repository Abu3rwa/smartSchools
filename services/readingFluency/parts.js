/**
 * Which blocks of a text a teacher is allowed to choose, and which are too long
 * for one recording. Used both when creating an assignment and when the teacher
 * edits its fluency settings, so the two paths validate identically.
 */
import { buildLevelsForTextDocument, readingBlocksFor } from '../../utils/readingBlocks.js';

const LONG_PART_WORDS = 250;

const invalidPart = (message) => Object.assign(new Error(message), {
    statusCode: 400,
    code: 'FLUENCY_PART_UNKNOWN'
});

const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

const rememberWarning = (warnings, block) => {
    if (!block) return;
    const words = wordCount(block.text);
    if (words > LONG_PART_WORDS) {
        warnings.push({
            key: block.key,
            wordCount: words,
            message: 'This part is long for one recording. Consider splitting it.'
        });
    }
};

/**
 * @returns {{ levels: Array, blocksByLevel: Array<Array>, warnings: Array }}
 */
export const fluencyPartsForText = (text, parts = []) => {
    const levels = buildLevelsForTextDocument(text);
    const blocksByLevel = levels.map((level) => readingBlocksFor(level));
    const knownKeys = new Set(blocksByLevel.flat().map((block) => block.key));
    const warnings = [];

    for (const part of parts) {
        if (part.level === null || part.level === undefined) {
            if (!knownKeys.has(part.key)) {
                throw invalidPart('One of the chosen parts is no longer in this reading.');
            }
            rememberWarning(warnings, blocksByLevel.flat().find((block) => block.key === part.key));
            continue;
        }
        const levelIndex = levels.findIndex((level) => level.targetLevel === part.level);
        const block = levelIndex >= 0
            ? blocksByLevel[levelIndex].find((item) => item.key === part.key)
            : null;
        if (!block) {
            throw invalidPart(`Part ${part.key} is not in level ${part.level}.`);
        }
        rememberWarning(warnings, block);
    }

    return { levels, blocksByLevel, warnings };
};
