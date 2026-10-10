// In-session queue: a missed word comes back a few cards later and must be answered correctly
// `threshold` times in a row before it leaves the session (the server keeps the long-term mastery).

export const REQUEUE_GAP = 3;

export const createQueue = (words, threshold = 2) => ({
    threshold,
    items: words.map((word) => ({ word, need: 0 })),
    answered: 0,
    missed: new Set()
});

export const currentItem = (queue) => queue.items[0] || null;

export const recordResult = (queue, correct) => {
    const [head, ...rest] = queue.items;
    if (!head) return queue;
    const missed = new Set(queue.missed);
    let need = head.need;
    if (correct) {
        need = head.need > 0 ? head.need - 1 : 0;
    } else {
        need = queue.threshold;
        missed.add(String(head.word.id));
    }
    const items = [...rest];
    if (need > 0) items.splice(Math.min(REQUEUE_GAP, items.length), 0, { word: head.word, need });
    return { ...queue, items, answered: queue.answered + 1, missed };
};

export const isDone = (queue) => queue.items.length === 0;
