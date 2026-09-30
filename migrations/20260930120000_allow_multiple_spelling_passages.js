export async function up(db) {
    const passages = db.collection('spellingpassages');
    const passageIndexes = await passages.indexes();
    const uniqueSessionIndex = passageIndexes.find((index) => index.name === 'session_1');
    if (uniqueSessionIndex) await passages.dropIndex(uniqueSessionIndex.name);

    const deliveries = db.collection('spellingemaildeliveries');
    const deliveryIndexes = await deliveries.indexes();
    for (const index of deliveryIndexes.filter((item) => item.name === 'session_1' || item.name === 'session_1_kind_1')) {
        await deliveries.dropIndex(index.name);
    }
    if (!deliveryIndexes.some((index) => index.name === 'passage_1_kind_1')) {
        await deliveries.createIndex(
            { passage: 1, kind: 1 },
            { unique: true, partialFilterExpression: { passage: { $type: 'objectId' } }, name: 'passage_1_kind_1' }
        );
    }
}

export async function down(db) {
    const deliveries = db.collection('spellingemaildeliveries');
    const indexes = await deliveries.indexes();
    if (indexes.some((index) => index.name === 'passage_1_kind_1')) await deliveries.dropIndex('passage_1_kind_1');
    await deliveries.createIndex({ session: 1, kind: 1 }, { unique: true, name: 'session_1_kind_1' });

    const passages = db.collection('spellingpassages');
    await passages.createIndex({ session: 1 }, { unique: true, name: 'session_1' });
}